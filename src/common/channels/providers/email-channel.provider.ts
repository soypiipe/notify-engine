import { Injectable } from "@nestjs/common";
import { IChannel } from "../interfaces/channel.interface";
import { Resend } from 'resend';

@Injectable()
export class EmailChannel implements IChannel{
    send(recipient: string, subject: string, body: string): Promise<{ success: boolean; error?: string; }> {
        throw new Error("Method not implemented.");
    }

}