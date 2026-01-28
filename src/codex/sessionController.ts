import type { ApiSessionClient } from '@/api/apiSession';

export interface SessionController {
    getSession: () => ApiSessionClient;
    onSessionSwap: (listener: (session: ApiSessionClient) => void) => () => void;
}
