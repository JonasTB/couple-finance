import { randomUUID } from 'node:crypto';
import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { register, uniqueEmail } from './auth-helpers';
import { createTestApp, FakeClock } from './create-test-app';

const DAY = 24 * 60 * 60 * 1000;

interface TestUser {
  email: string;
  token: string;
}

interface HouseholdBody {
  id: string;
  version: number;
  me: { memberId: string; role: string };
  defaultSplit: { type: string };
}

describe('Households & invitations (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let db: DataSource;
  const clock = new FakeClock();

  beforeAll(async () => {
    app = await createTestApp({ clock });
    server = app.getHttpServer();
    db = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  // Access tokens expire after 15 min of (fake) time; register fresh users per test.
  const newUser = async (prefix = 'user'): Promise<TestUser> => {
    const email = uniqueEmail(prefix);
    const { accessToken } = await register(server, { email });
    return { email, token: accessToken };
  };

  const api = (user: TestUser) => ({
    get: (path: string) =>
      request(server).get(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`),
    post: (path: string, body?: object) =>
      request(server)
        .post(`/api/v1${path}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
    patch: (path: string, body: object) =>
      request(server)
        .patch(`/api/v1${path}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send(body),
    delete: (path: string) =>
      request(server).delete(`/api/v1${path}`).set('Authorization', `Bearer ${user.token}`),
  });

  const createHousehold = async (owner: TestUser, name = 'Casa Teste'): Promise<HouseholdBody> => {
    const response = await api(owner).post('/households', { name }).expect(201);
    return response.body as HouseholdBody;
  };

  const invite = async (owner: TestUser, householdId: string, email: string): Promise<string> => {
    const response = await api(owner)
      .post(`/households/${householdId}/invitations`, { email })
      .expect(201);
    return (response.body as { token: string }).token;
  };

  /** Owner + accepted partner. */
  const couple = async () => {
    const owner = await newUser('owner');
    const partner = await newUser('partner');
    const household = await createHousehold(owner);
    const token = await invite(owner, household.id, partner.email);
    await api(partner).post('/invitations/accept', { token }).expect(200);
    const members = (await api(owner).get(`/households/${household.id}/members`).expect(200))
      .body as { id: string; isMe: boolean }[];
    const partnerMemberId = members.find((member) => !member.isMe)?.id ?? '';
    return { owner, partner, household, partnerMemberId };
  };

  describe('creating and reading', () => {
    it('creates a household with defaults; the creator is OWNER; it is audited', async () => {
      const owner = await newUser();
      const response = await api(owner).post('/households', { name: '  Casa Silva  ' }).expect(201);
      expect(response.body).toMatchObject({
        name: 'Casa Silva',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
        defaultSplit: { type: 'EQUAL' },
        version: 1,
        me: { role: 'OWNER' },
      });
      const { id } = response.body as HouseholdBody;

      const list = await api(owner).get('/households').expect(200);
      expect(list.body).toEqual([
        expect.objectContaining({ id, name: 'Casa Silva', role: 'OWNER', activeMemberCount: 1 }),
      ]);

      const audit = await db.query<{ entity_type: string; action: string; request_id: string }[]>(
        `SELECT entity_type, action, request_id FROM audit_events WHERE household_id = $1 ORDER BY entity_type`,
        [id],
      );
      expect(audit.map((row) => [row.entity_type, row.action])).toEqual([
        ['HOUSEHOLD', 'CREATE'],
        ['HOUSEHOLD_MEMBER', 'CREATE'],
      ]);
      expect(audit[0]?.request_id).toEqual(expect.any(String));
    });

    it.each([
      ['an empty name', { name: '  ' }],
      ['an unsupported currency', { name: 'Casa', currency: 'JPY' }],
      ['an unknown time zone', { name: 'Casa', timezone: 'Mars/Olympus' }],
      [
        'a custom default split at creation',
        { name: 'Casa', defaultSplit: { type: 'CUSTOM_PERCENT', weights: [] } },
      ],
      ['weights on an EQUAL split', { name: 'Casa', defaultSplit: { type: 'EQUAL', weights: [] } }],
    ])('rejects %s', async (_label, body) => {
      const owner = await newUser();
      const response = await api(owner).post('/households', body).expect(400);
      expect(response.body).toMatchObject({ error: { code: 'VALIDATION_FAILED' } });
    });

    it('requires authentication', async () => {
      await request(server).get('/api/v1/households').expect(401);
    });
  });

  describe('isolation between households (NFR-02)', () => {
    it('answers 404 to non-members on every household route', async () => {
      const owner = await newUser('owner');
      const outsider = await newUser('outsider');
      const { id, version } = await createHousehold(owner);
      const invitationId = randomUUID();
      const memberId = randomUUID();

      const attempts = [
        api(outsider).get(`/households/${id}`),
        api(outsider).patch(`/households/${id}`, { version, name: 'Hacked' }),
        api(outsider).delete(`/households/${id}`),
        api(outsider).get(`/households/${id}/members`),
        api(outsider).delete(`/households/${id}/members/${memberId}`),
        api(outsider).post(`/households/${id}/leave`),
        api(outsider).post(`/households/${id}/transfer-ownership`, { memberId }),
        api(outsider).get(`/households/${id}/invitations`),
        api(outsider).post(`/households/${id}/invitations`, { email: outsider.email }),
        api(outsider).delete(`/households/${id}/invitations/${invitationId}`),
      ];
      for (const response of await Promise.all(attempts)) {
        expect(response.status).toBe(404);
        expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
      }
      expect((await api(outsider).get('/households').expect(200)).body).toEqual([]);
      // Nothing changed.
      expect((await api(owner).get(`/households/${id}`).expect(200)).body).toMatchObject({
        name: 'Casa Teste',
        version: 1,
      });
    });

    it('answers 404 for malformed and unknown household ids', async () => {
      const user = await newUser();
      await api(user).get('/households/not-a-uuid').expect(404);
      await api(user).get(`/households/${randomUUID()}`).expect(404);
    });
  });

  describe('invitation lifecycle', () => {
    it('invites, previews (public), accepts and lists both members', async () => {
      const owner = await newUser('owner');
      const partner = await newUser('partner');
      const household = await createHousehold(owner, 'Casa da Ana');

      const created = await api(owner)
        .post(`/households/${household.id}/invitations`, {
          email: ` ${partner.email.toUpperCase()} `,
        })
        .expect(201);
      const { token, invitation } = created.body as {
        token: string;
        invitation: { email: string; status: string };
      };
      expect(invitation).toMatchObject({ email: partner.email, status: 'PENDING' });
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const preview = await request(server)
        .post('/api/v1/invitations/preview')
        .send({ token })
        .expect(200);
      expect(preview.body).toMatchObject({
        householdName: 'Casa da Ana',
        inviterDisplayName: 'Alex',
        emailHint: expect.stringMatching(/^p\*+@example\.com$/) as unknown,
      });

      const accepted = await api(partner).post('/invitations/accept', { token }).expect(200);
      expect(accepted.body).toEqual({ householdId: household.id });

      const members = await api(partner).get(`/households/${household.id}/members`).expect(200);
      expect(members.body).toEqual([
        expect.objectContaining({
          email: owner.email,
          role: 'OWNER',
          status: 'ACTIVE',
          isMe: false,
        }),
        expect.objectContaining({
          email: partner.email,
          role: 'MEMBER',
          status: 'ACTIVE',
          isMe: true,
        }),
      ]);
      expect(
        (await api(owner).get(`/households/${household.id}/invitations`).expect(200)).body,
      ).toEqual([]);

      // Single use.
      await request(server).post('/api/v1/invitations/preview').send({ token }).expect(422);

      // The raw token is never stored.
      const stored = await db.query<unknown[]>(
        `SELECT 1 FROM household_invitations WHERE token_hash = $1`,
        [token],
      );
      expect(stored).toHaveLength(0);
      const snapshots = await db.query<{ after: string }[]>(
        `SELECT after::text FROM audit_events WHERE entity_type = 'HOUSEHOLD_INVITATION' AND household_id = $1`,
        [household.id],
      );
      for (const { after } of snapshots) {
        expect(after).not.toContain('tokenHash');
      }
    });

    it('rejects acceptance by a user with another email, keeping the invitation valid', async () => {
      const owner = await newUser('owner');
      const partner = await newUser('partner');
      const intruder = await newUser('intruder');
      const household = await createHousehold(owner);
      const token = await invite(owner, household.id, partner.email);

      const response = await api(intruder).post('/invitations/accept', { token }).expect(403);
      expect(response.body).toMatchObject({ error: { code: 'INVITATION_EMAIL_MISMATCH' } });
      await api(intruder).get(`/households/${household.id}`).expect(404);
      await api(partner).post('/invitations/accept', { token }).expect(200);
    });

    it('expires after 7 days; re-inviting the same email issues a new link', async () => {
      const owner = await newUser('owner');
      const partner = await newUser('partner');
      const household = await createHousehold(owner);
      const oldToken = await invite(owner, household.id, partner.email);

      clock.advance(7 * DAY + 1000);
      const refreshedOwner = { ...owner, token: await loginToken(owner) };
      const refreshedPartner = { ...partner, token: await loginToken(partner) };

      await request(server)
        .post('/api/v1/invitations/preview')
        .send({ token: oldToken })
        .expect(422);
      await api(refreshedPartner).post('/invitations/accept', { token: oldToken }).expect(422);
      const listed = await api(refreshedOwner)
        .get(`/households/${household.id}/invitations`)
        .expect(200);
      expect(listed.body).toEqual([expect.objectContaining({ status: 'EXPIRED' })]);

      const newToken = await invite(refreshedOwner, household.id, partner.email);
      await api(refreshedPartner).post('/invitations/accept', { token: newToken }).expect(200);
    });

    it('revokes an invitation', async () => {
      const owner = await newUser('owner');
      const partner = await newUser('partner');
      const household = await createHousehold(owner);
      const created = await api(owner)
        .post(`/households/${household.id}/invitations`, { email: partner.email })
        .expect(201);
      const { token, invitation } = created.body as { token: string; invitation: { id: string } };

      await api(owner)
        .delete(`/households/${household.id}/invitations/${invitation.id}`)
        .expect(204);
      await api(partner).post('/invitations/accept', { token }).expect(422);
      await api(owner)
        .delete(`/households/${household.id}/invitations/${invitation.id}`)
        .expect(404);
    });

    it.each([
      ['an unknown token', 'x'.repeat(43), 422],
      ['a malformed token', 'short', 400],
    ])('rejects %s', async (_label, token, status) => {
      const user = await newUser();
      await api(user).post('/invitations/accept', { token }).expect(status);
    });

    it('rejects inviting yourself or a current member', async () => {
      const { owner, partner, household } = await couple();
      await api(owner)
        .post(`/households/${household.id}/invitations`, { email: owner.email })
        .expect(400);
      const response = await api(owner)
        .post(`/households/${household.id}/invitations`, { email: partner.email })
        .expect(409);
      expect(response.body).toMatchObject({ error: { code: 'ALREADY_MEMBER' } });
    });
  });

  describe('capacity (2 active members, ADR-005)', () => {
    it('counts a valid pending invitation against the cap until it is revoked', async () => {
      const owner = await newUser('owner');
      const household = await createHousehold(owner);
      const first = await api(owner)
        .post(`/households/${household.id}/invitations`, { email: uniqueEmail('first') })
        .expect(201);
      const blocked = await api(owner)
        .post(`/households/${household.id}/invitations`, { email: uniqueEmail('second') })
        .expect(409);
      expect(blocked.body).toMatchObject({ error: { code: 'HOUSEHOLD_FULL' } });

      const { invitation } = first.body as { invitation: { id: string } };
      await api(owner)
        .delete(`/households/${household.id}/invitations/${invitation.id}`)
        .expect(204);
      await api(owner)
        .post(`/households/${household.id}/invitations`, { email: uniqueEmail('second') })
        .expect(201);
    });

    it('rejects invitations once the household is full', async () => {
      const { owner, household } = await couple();
      await api(owner)
        .post(`/households/${household.id}/invitations`, { email: uniqueEmail('third') })
        .expect(409);
    });

    it('serializes simultaneous invitations: only one fits', async () => {
      const owner = await newUser('owner');
      const household = await createHousehold(owner);
      const results = await Promise.all(
        [1, 2, 3].map((n) =>
          api(owner).post(`/households/${household.id}/invitations`, {
            email: uniqueEmail(`c${n}`),
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    });
  });

  describe('roles and permissions', () => {
    it('lets a MEMBER read but not manage', async () => {
      const { partner, household, partnerMemberId } = await couple();
      const id = household.id;
      await api(partner).get(`/households/${id}`).expect(200);
      await api(partner).get(`/households/${id}/members`).expect(200);

      const forbidden = [
        api(partner).patch(`/households/${id}`, { version: 1, name: 'X' }),
        api(partner).delete(`/households/${id}`),
        api(partner).get(`/households/${id}/invitations`),
        api(partner).post(`/households/${id}/invitations`, { email: uniqueEmail() }),
        api(partner).post(`/households/${id}/transfer-ownership`, { memberId: partnerMemberId }),
        api(partner).delete(`/households/${id}/members/${household.me.memberId}`),
      ];
      for (const response of await Promise.all(forbidden)) {
        expect(response.status).toBe(403);
        expect(response.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
      }
    });

    it('transfers ownership', async () => {
      const { owner, partner, household, partnerMemberId } = await couple();
      await api(owner)
        .post(`/households/${household.id}/transfer-ownership`, { memberId: partnerMemberId })
        .expect(204);
      expect(
        (await api(partner).get(`/households/${household.id}`).expect(200)).body,
      ).toMatchObject({
        me: { role: 'OWNER' },
      });
      await api(owner).patch(`/households/${household.id}`, { version: 1, name: 'X' }).expect(403);
    });
  });

  describe('settings', () => {
    it('updates name and a custom default split with optimistic concurrency', async () => {
      const { owner, household, partnerMemberId } = await couple();
      const weights = [
        { memberId: household.me.memberId, bps: 6000 },
        { memberId: partnerMemberId, bps: 4000 },
      ];
      const updated = await api(owner)
        .patch(`/households/${household.id}`, {
          version: 1,
          name: 'Casa Nova',
          defaultSplit: { type: 'CUSTOM_PERCENT', weights },
        })
        .expect(200);
      expect(updated.body).toMatchObject({
        name: 'Casa Nova',
        version: 2,
        defaultSplit: { type: 'CUSTOM_PERCENT', weights },
      });

      const stale = await api(owner)
        .patch(`/households/${household.id}`, { version: 1, name: 'Outra' })
        .expect(409);
      expect(stale.body).toMatchObject({ error: { code: 'VERSION_CONFLICT' } });
    });

    it.each([
      ['weights that do not sum to 100%', 6000, 3000],
      ['negative weights', 11000, -1000],
    ])('rejects %s', async (_label, a, b) => {
      const { owner, household, partnerMemberId } = await couple();
      await api(owner)
        .patch(`/households/${household.id}`, {
          version: 1,
          defaultSplit: {
            type: 'CUSTOM_PERCENT',
            weights: [
              { memberId: household.me.memberId, bps: a },
              { memberId: partnerMemberId, bps: b },
            ],
          },
        })
        .expect(400);
    });
  });

  describe('leaving, removing and archiving', () => {
    it('requires the owner to transfer ownership before leaving a shared household', async () => {
      const { owner, household } = await couple();
      const response = await api(owner).post(`/households/${household.id}/leave`).expect(409);
      expect(response.body).toMatchObject({ error: { code: 'OWNERSHIP_TRANSFER_REQUIRED' } });
    });

    it('lets a member leave; access ends at once; custom split falls back to EQUAL', async () => {
      const { owner, partner, household, partnerMemberId } = await couple();
      await api(owner)
        .patch(`/households/${household.id}`, {
          version: 1,
          defaultSplit: {
            type: 'CUSTOM_PERCENT',
            weights: [
              { memberId: household.me.memberId, bps: 5000 },
              { memberId: partnerMemberId, bps: 5000 },
            ],
          },
        })
        .expect(200);

      await api(partner).post(`/households/${household.id}/leave`).expect(204);
      await api(partner).get(`/households/${household.id}`).expect(404);
      const detail = await api(owner).get(`/households/${household.id}`).expect(200);
      expect(detail.body).toMatchObject({ defaultSplit: { type: 'EQUAL' } });
      expect(
        (await api(owner).get(`/households/${household.id}/members`).expect(200)).body,
      ).toHaveLength(1);
    });

    it('removes a member, whose still-valid access token stops working for the household', async () => {
      const { owner, partner, household, partnerMemberId } = await couple();
      await api(owner).delete(`/households/${household.id}/members/${partnerMemberId}`).expect(204);
      await api(partner).get(`/households/${household.id}`).expect(404);
      await api(owner)
        .delete(`/households/${household.id}/members/${household.me.memberId}`)
        .expect(400);
    });

    it('lets a former member rejoin with a new invitation, keeping history', async () => {
      const { owner, partner, household, partnerMemberId } = await couple();
      await api(owner).delete(`/households/${household.id}/members/${partnerMemberId}`).expect(204);
      const token = await invite(owner, household.id, partner.email);
      await api(partner).post('/invitations/accept', { token }).expect(200);
      const rows = await db.query<{ status: string }[]>(
        `SELECT m.status FROM household_members m JOIN users u ON u.id = m.user_id
         WHERE m.household_id = $1 AND u.email = $2 ORDER BY m.joined_at`,
        [household.id, partner.email],
      );
      expect(rows.map((row) => row.status)).toEqual(['REMOVED', 'ACTIVE']);
    });

    it('archives when the last member leaves', async () => {
      const owner = await newUser();
      const household = await createHousehold(owner);
      await api(owner).post(`/households/${household.id}/leave`).expect(204);
      await api(owner).get(`/households/${household.id}`).expect(404);
      expect((await api(owner).get('/households').expect(200)).body).toEqual([]);
    });

    it('archives on request and invalidates pending invitations', async () => {
      const owner = await newUser();
      const household = await createHousehold(owner);
      const token = await invite(owner, household.id, uniqueEmail());
      await api(owner).delete(`/households/${household.id}`).expect(204);
      await api(owner).get(`/households/${household.id}`).expect(404);
      await request(server).post('/api/v1/invitations/preview').send({ token }).expect(422);
    });
  });

  async function loginToken(user: TestUser): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .set('X-Requested-With', 'couple-finance')
      .send({ email: user.email, password: 'cafe com leite na varanda' })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }
});
