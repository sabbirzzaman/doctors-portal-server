const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

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
                patientName: treatment.patientName,
            };
            const exist = await bookingCollection.findOne(query);
            if(exist) {
                return res.send({success: false, booking: exist})
            } else {
                const result = await bookingCollection.insertOne(treatment);
                return res.send({success: true, result});
            }
        });

        app.get('/available', async (req, res) => {
            const date = req.query.date;

            // get all services
            const treatments = await treatmentCollection.find().toArray();

            // get booking of the selected date
            const query = {appointmentDate: date}
            const bookings = await bookingCollection.find(query).toArray();

            treatments.forEach(treatment => {
                const appointmentBookings = bookings.filter(booking => booking.treatmentName === treatment.name);
                const booked = appointmentBookings.map(booking => booking.appointmentSlot);

                const available = treatment.slots.filter(slot => !booked.includes(slot))

                treatment.slots = available;
            })

            res.send(treatments)
        })
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
