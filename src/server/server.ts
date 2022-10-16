import crypto from 'crypto';

import express, { ErrorRequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import session from 'express-session';
import { body, query, validationResult } from 'express-validator';
import withExpressWs from 'express-ws';
import { Server as HttpServer } from 'http';

import Device from '../lib/types/device';

import SmartConnectUser from '../lib/types/smart-connect-user';

declare module 'express-session' {
    interface SessionData {
        user?: SmartConnectUser;
    }
}

class Server {
    private app = withExpressWs(express()).app;
    private httpServer = null as HttpServer | null;

    private users: SmartConnectUser[];
    private sessionSecret;

    constructor(
        users: SmartConnectUser[],
        sessionSecret: string,
        handlers: {
            getDevices: () => Promise<Device[]>;
            getState: (id: string) => Promise<any>;
            setState: (id: string, value: any) => Promise<void>;
            subscribeState: (id: string, callback: (value: any) => void) => Promise<void>;
            unsubscribeState: (id: string, callback: (value: any) => void) => Promise<void>;
        },
        allowdOrigins: {
            private: string[];
            public: string[];
        },
    ) {
        this.users = users;
        this.sessionSecret = sessionSecret;

        this.app.use(((err, req, res, _next) => {
            console.error(err);
            res.status(500).send('Internal Server Error');
        }) as ErrorRequestHandler);

        this.app.use((req, res, next) => {
            const origin = req.headers.origin;

            if (!origin || req.method !== 'OPTIONS') {
                return next();
            }

            const isPrivate = req.headers['Access-Control-Request-Private-Network'] === 'true';

            res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Credentials', 'true');

            if (isPrivate) {
                if (allowdOrigins.private.includes(origin)) {
                    res.setHeader('Access-Control-Allow-Private-Network', 'true');
                }
            }

            const allowedOrigins = [...allowdOrigins.private, ...allowdOrigins.public];
            if (allowedOrigins.includes(origin)) {
                res.setHeader('Access-Control-Allow-Origin', origin);
            }

            return next();
        });

        this.app.use(
            session({
                secret: this.sessionSecret,
            }),
        );
        this.app.use(express.json());
        this.app.use(
            '/login',
            rateLimit({
                windowMs: 5 * 60 * 1000,
                max: 5,
            }),
        );

        this.app.get('/', (req, res) => {
            res.json({
                discover: 'smart-connect',
                serviceID: 'iobroker.smart-connect',
                serviceVersion: '1.0.0',
                serviceName: 'Smart Connect ioBroker Backend',
            });
        });

        this.app.post('/login', body('username').isString(), body('password').isString(), (req, res) => {
            const { username, password } = req.body;

            let validUser = null as SmartConnectUser | null;
            for (const user of this.users) {
                if (user.username.length !== username.length || user.password.length !== password.length) {
                    continue;
                }

                const userNameMatches = crypto.timingSafeEqual(Buffer.from(user.username), Buffer.from(username));
                const passwordMatches = crypto.timingSafeEqual(Buffer.from(user.password), Buffer.from(password));

                if (userNameMatches && passwordMatches) {
                    validUser = user;
                }
            }

            if (validUser) {
                req.session.user = validUser;
                res.status(200).send('OK');
            } else {
                res.status(400).send('Invalid credentials');
            }
        });

        this.app.post('/logout', (req, res) => {
            req.session.destroy((err) => {
                if (err) {
                    res.status(500).send('Internal Server Error');
                } else {
                    res.status(200).send('OK');
                }
            });
        });

        this.app.use((req, res, next) => {
            const nonSecureRoutes = ['/login', '/logout', '/'];

            if (req.session.user || nonSecureRoutes.includes(req.path)) {
                return next();
            }
            res.status(401).send('Unauthorized');
        });

        this.app.get('/devices', async (req, res) => {
            if (Object.keys(req.query).length) {
                res.status(400).send('Query parameters are not supported');
                return;
            }

            res.status(200).json(await handlers.getDevices());
        });

        this.app.get<{
            id: string;
        }>(
            '/state',
            query('id')
                .isString()
                .exists()
                .matches(/([a-z0-9]*\.)*[a-z0-9]+$/),
            async (req, res) => {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    res.status(400).send('Bad request');
                    return;
                }

                const { id } = req.query;

                try {
                    res.status(200).json({
                        value: await handlers.getState(id as string),
                    });
                } catch (err: any) {
                    res.status(400).send(err?.message || 'Bad request');
                }
            },
        );

        this.app.post<{
            id: string;
        }>(
            '/state',
            query('id')
                .isString()
                .exists()
                .matches(/([a-z0-9]*\.)*[a-z0-9]+$/),
            body('value').exists(),
            async (req, res) => {
                const errors = validationResult(req);
                if (!errors.isEmpty()) {
                    res.status(400).send('Bad request');
                    return;
                }

                const { id } = req.query;
                const { value } = req.body;

                try {
                    await handlers.setState(id as string, value);
                    res.status(200).send('OK');
                } catch (err: any) {
                    res.status(400).send(err?.message || 'Bad request');
                }
            },
        );

        this.app.ws('/', async (ws) => {
            const subscriptions = new Map<string, (value: any) => void>();

            ws.on('message', async (msg: string) => {
                let data;
                try {
                    data = JSON.parse(msg);
                } catch (err) {
                    ws.send(
                        JSON.stringify({
                            error: 'Invalid JSON',
                        }),
                    );
                    return;
                }
                const { type, id, uuid } = data;

                if (!id) {
                    ws.send(
                        JSON.stringify({
                            error: 'Missing id',
                        }),
                    );
                    return;
                }

                if (!uuid) {
                    ws.send(
                        JSON.stringify({
                            error: 'Missing uuid',
                        }),
                    );
                }

                if (type === 'subscribe') {
                    try {
                        const cb = (value: any) => {
                            ws.send(
                                JSON.stringify({
                                    id,
                                    value,
                                    uuid,
                                }),
                            );
                        };
                        await handlers.subscribeState(id, cb);
                        subscriptions.set(uuid, cb);
                    } catch (e: any) {
                        ws.send(
                            JSON.stringify({
                                error: e?.message || 'Internal Server Error',
                                uuid,
                            }),
                        );
                    }
                } else if (type === 'unsubscribe') {
                    const cb = subscriptions.get(uuid);

                    if (!cb) {
                        throw new Error('No subscription found');
                    }

                    await handlers.unsubscribeState(id, cb);
                } else {
                    ws.send(
                        JSON.stringify({
                            error: 'Invalid message',
                            uuid,
                        }),
                    );
                }
            });
        });
    }

    listen(port: number, ip: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.app.addListener('error', reject);

            this.httpServer = this.app.listen(port, ip, () => {
                resolve();

                this.app.removeListener('error', reject);
            });
        });
    }

    close(): void {
        this.httpServer?.close();
    }
}

export default Server;
