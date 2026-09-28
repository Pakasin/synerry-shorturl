import type { SessionUser } from './auth/session';

export type AppEnv = {
  Variables: {
    user: SessionUser;
  };
};
