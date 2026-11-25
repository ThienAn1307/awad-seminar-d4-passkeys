import { startApp } from './server.mjs';

const app = await startApp({ signal: process.env.SIGNAL === '1', acceptedList: process.env.ACCEPTED_LIST ?? 'off', port: Number(process.env.PORT ?? 3000) });
console.log(`App đang chạy tại ${app.url}/signin`);
