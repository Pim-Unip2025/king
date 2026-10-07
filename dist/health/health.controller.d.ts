import { DatabaseService } from '../database/database.service';
export declare class HealthController {
    private readonly db;
    constructor(db: DatabaseService);
    check(): Promise<{
        status: string;
        banco: string;
        agora: Date;
    }>;
}
