import dotenv from 'dotenv'
dotenv.config();

import express, { urlencoded } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import userRouter from './routes/users.route.js';
import storeRouter from './routes/store.route.js';
import technicianRouter from './routes/technician.route.js';
import adminRouter from './routes/admin.route.js';
import paymentRouter from './routes/payment.route.js';
import authLogger from './middlewares/authLogger.js';
import { startEventWorker } from './workers/eventWorker.js';

const app = express();

app.use(cors({
    origin: ['http://localhost:5173', "https://lintlockfrontend.vercel.app"], 
    credentials:true
}));

app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook

);
app.use(express.json());
app.use(cookieParser());
app.use(urlencoded({extended:true}));


import connectDb from './DB/index.js'
import { stripeWebhook } from './controllers/payment.controller.js';

connectDb()
.then(()=> console.log("mongo db connected successfully"))

app.get('/', (req, res) => {
    res.send('API is working');
});

// attach audit middleware early so it can register events for routed handlers
app.use(authLogger);
app.use('/api/user', userRouter);
app.use('/api/store', storeRouter);
app.use('/api/technician', technicianRouter);
app.use('/api/admin', adminRouter);
app.use('/api/payment', paymentRouter);


// start background worker to flush audit logs
startEventWorker(Number(process.env.AUDIT_FLUSH_MS) || 5000);


app.use((error, req, res, _next) => {
    return res.status(500).json({
        error : error.message || 'something went wrong'
    })
})

const port = process.env.PORT || 5000;
app.listen(port, ()=> {
    console.log("The app is listening on port: ", port);
})