export interface IChannel {
    send(recipient: string, subject: string, body: string): Promise<{
        success: boolean;
        error?: string;
        externalId?: string;
    }>
}