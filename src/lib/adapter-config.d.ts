import type SmartConnectUser from './types/smart-connect-user';

declare global {
    namespace ioBroker {
        interface AdapterConfig {
            users: SmartConnectUser[];
            ip: string;
            port: number;
            rootPath: string;
            sessionSecret: string;
            allowedOrigins: {
                origin: string;
                private: boolean;
            }[];
        }
    }
}

export {};
