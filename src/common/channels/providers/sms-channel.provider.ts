import { Injectable } from "@nestjs/common";
import { IChannel } from "../interfaces/channel.interface";

@Injectable()
export class SmsChannel implements IChannel{
    send(recipient: string, subject: string, body: string): Promise<{ success: boolean; error?: string; }> {
        throw new Error("Method not implemented.");
    }
}