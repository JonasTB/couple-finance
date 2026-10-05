import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_ROUTE = 'auth:isPublic';

/** Opts a route out of the global authentication guard. Routes are protected by default. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_ROUTE, true);
