export abstract class IQueue {
    abstract add(jobName: string, data: any): Promise<{ id: string }>;
}
