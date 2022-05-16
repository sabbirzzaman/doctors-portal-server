const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// verify jwt
const verifyToken = (req, res, next) => {
    const authorization = req.headers.authorization;

    if (!authorization) {
        res.status(401).send({ message: 'Unauthorized Access' });
    } else {
        const token = authorization.split(' ')[1];
        jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
            if (err) {
                return res.status(403).send({ message: 'Forbidden Access' });
            } else {
                req.decoded = decoded;
                next();
            }
        });
    }
};

// Connect mongodb
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ucjh0.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

const run = async () => {
    await client.connect();

    try {
        const treatmentCollection = client
            .db('doctors-collection')
            .collection('treatment');

        const bookingCollection = client
            .db('doctors-collection')
            .collection('booking');

        const userCollection = client
            .db('doctors-collection')
            .collection('users');

        // treatment API
        app.get('/treatments', async (req, res) => {
            const query = {};
            const cursor = treatmentCollection.find(query);

            const result = await cursor.toArray();
            res.send(result);
        });

        app.post('/treatment', async (req, res) => {
            const treatment = req.body;
            const query = {
                treatmentName: treatment.treatmentName,
                appointmentDate: treatment.appointmentDate,
                patientEmail: treatment.patientEmail,
            };
            const exist = await bookingCollection.findOne(query);
            if (exist) {
                return res.send({ success: false, booking: exist });
            } else {
                const result = await bookingCollection.insertOne(treatment);
                return res.send({ success: true, result });
            }
        });

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // get all services
            const treatments = await treatmentCollection.find().toArray();

            // get booking of the selected date
            const query = { appointmentDate: date };
            const bookings = await bookingCollection.find(query).toArray();

            treatments.forEach((treatment) => {
                const appointmentBookings = bookings.filter(
                    (booking) => booking.treatmentName === treatment.name
                );
                const booked = appointmentBookings.map(
                    (booking) => booking.appointmentSlot
                );

                const available = treatment.slots.filter(
                    (slot) => !booked.includes(slot)
                );

                treatment.slots = available;
            });

            res.send(treatments);
        });

        app.get('/bookings', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { patientEmail: email };
            const verifiedEmail = req.decoded.email;

            if (email === verifiedEmail) {
                const result = await bookingCollection.find(query).toArray();
                return res.send(result);
            } else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        });

        app.put('/users/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;

            const query = { email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };

            const result = await userCollection.updateOne(
                query,
                updateDoc,
                options
            );

            const accessToken = jwt.sign(
                { email },
                process.env.ACCESS_TOKEN_SECRET,
                {
                    expiresIn: '1d',
                }
            );

            res.send({ result, accessToken });
        });

        // app,get('/users', async (req, res) => {
        //     const email = req.query.email;
        //     const result = await userCollection.find().toArray();
        //     res.send(result)
        // })
    } finally {
    }
};

run().catch(console.dir);

// Root Api
app.get('/', (req, res) => {
    res.send('Welcome to doctors portal server');
});

app.listen(port, () => {
    console.log('doctors portal server is running');
});
