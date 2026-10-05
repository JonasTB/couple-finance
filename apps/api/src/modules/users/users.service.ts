import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ErrorCode, type UserProfile } from '@couple-finance/shared';
import { In, QueryFailedError, type Repository } from 'typeorm';
import { AppException } from '../../common/errors/app.exception';
import { IdGenerator } from '../../common/ids/id-generator';
import { UserEntity } from './user.entity';

const PG_UNIQUE_VIOLATION = '23505';

export interface UserCredentials {
  userId: string;
  passwordHash: string;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName: string;
}

function toProfile(entity: UserEntity): UserProfile {
  return {
    id: entity.id,
    email: entity.email,
    displayName: entity.displayName,
    createdAt: entity.createdAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driverError: unknown = error.driverError;
  return (
    typeof driverError === 'object' &&
    driverError !== null &&
    'code' in driverError &&
    driverError.code === PG_UNIQUE_VIOLATION &&
    'constraint' in driverError &&
    driverError.constraint === constraint
  );
}

/** Public API of the users module. Emails are expected already normalized (trim + lower-case). */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    private readonly ids: IdGenerator,
  ) {}

  async findProfile(userId: string): Promise<UserProfile | null> {
    const entity = await this.users.findOneBy({ id: userId });
    return entity ? toProfile(entity) : null;
  }

  async findProfiles(userIds: string[]): Promise<Map<string, UserProfile>> {
    if (userIds.length === 0) {
      return new Map();
    }
    // Includes soft-deleted users: former members must still be displayable in history.
    const entities = await this.users.find({ where: { id: In(userIds) }, withDeleted: true });
    return new Map(entities.map((entity) => [entity.id, toProfile(entity)]));
  }

  async exists(userId: string): Promise<boolean> {
    return this.users.existsBy({ id: userId });
  }

  async findCredentialsByEmail(email: string): Promise<UserCredentials | null> {
    const entity = await this.users.findOne({
      select: { id: true, passwordHash: true },
      where: { email },
    });
    return entity ? { userId: entity.id, passwordHash: entity.passwordHash } : null;
  }

  async create(input: NewUser): Promise<UserProfile> {
    const entity = this.users.create({ id: this.ids.next(), ...input });
    try {
      return toProfile(await this.users.save(entity));
    } catch (error) {
      // The unique constraint is the source of truth, so concurrent sign-ups are safe.
      if (isUniqueViolation(error, 'uq_users_email')) {
        throw new AppException(
          ErrorCode.EMAIL_ALREADY_REGISTERED,
          'An account with this email already exists.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
    await this.users.update({ id: userId }, { passwordHash });
  }

  async updateDisplayName(userId: string, displayName: string): Promise<UserProfile | null> {
    await this.users.update({ id: userId }, { displayName });
    return this.findProfile(userId);
  }
}
