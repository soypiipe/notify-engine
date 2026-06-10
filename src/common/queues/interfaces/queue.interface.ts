export interface IQueue {
    add(jobName: string, data: any) : Promise<{ id: string }>

    process(): void
}