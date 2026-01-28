export type PermissionMode = 'default' | 'read-only' | 'safe-yolo' | 'yolo';

export interface CodexMode {
    permissionMode: PermissionMode;
    model?: string;
}
