import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest } from '../../../common/auth/current-user.decorator';
import { householdNotFound } from '../application/errors';
import { HouseholdAccess } from '../application/household-access';
import { type MemberContext } from '../application/member-context';
import { type HouseholdPermission } from '../domain/permissions';

const PERMISSION_KEY = 'households:permission';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MemberRequest = AuthenticatedRequest & {
  params: Record<string, string | undefined>;
  member?: MemberContext;
};

/**
 * Declares the permission a household-scoped route needs. The route must have a
 * `:householdId` path parameter and be protected by `HouseholdMemberGuard`.
 */
export const RequireHouseholdPermission = (permission: HouseholdPermission): MethodDecorator =>
  SetMetadata(PERMISSION_KEY, permission);

/** Resolves the caller's membership for `:householdId` on every request (NFR-02). */
@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: HouseholdAccess,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.get<HouseholdPermission | undefined>(
      PERMISSION_KEY,
      context.getHandler(),
    );
    if (!permission) {
      throw new Error('HouseholdMemberGuard requires @RequireHouseholdPermission on the route');
    }
    const request = context.switchToHttp().getRequest<MemberRequest>();
    const householdId = request.params.householdId;
    if (!request.user || !householdId || !UUID.test(householdId)) {
      throw householdNotFound();
    }
    request.member = await this.access.require(request.user.userId, householdId, permission);
    return true;
  }
}

export const CurrentMember = createParamDecorator(
  (_data: unknown, context: ExecutionContext): MemberContext => {
    const { member } = context.switchToHttp().getRequest<MemberRequest>();
    if (!member) {
      throw new Error('CurrentMember used on a route without HouseholdMemberGuard');
    }
    return member;
  },
);
