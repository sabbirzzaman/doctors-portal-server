const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const PORT = process.env.PORT || 5000;

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

    const userCollection = client.db('doctors-collection').collection('users');

    const doctorCollection = client
      .db('doctors-collection')
      .collection('doctors');

    const transactionCollection = client
      .db('doctors-collection')
      .collection('transactions');

    const verifyAdmin = async (req, res, next) => {
      const requester = req.decoded.email;
      const requesterUser = await userCollection.findOne({
        email: requester,
      });

      if (requesterUser.role === 'Admin') {
        next();
      } else {
        res.status(403).send({ message: 'Forbidden Access' });
      }
    };

    // payment
    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { treatmentPrice } = req.body;
      const amount = treatmentPrice * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });

      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // treatment API
    app.get('/treatments', async (req, res) => {
      const query = {};
      const cursor = treatmentCollection.find(query).project({ name: 1 });

      const result = await cursor.toArray();
      res.send(result);
    });

    // treatment post api
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

    // treatment api with only available slots
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

    // Booking Api
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

    // Booking Api by id
    app.get('/booking/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await bookingCollection.findOne(query);

      res.send(result);
    });

    // payment information
    app.patch('/booking/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const query = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };

      const result = await transactionCollection.insertOne(payment);
      const updated = await bookingCollection.updateOne(query, updateDoc);

      res.send(updated);
    });

    // user api
    app.get('/users', verifyToken, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // user by login
    app.put('/users/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;

      const query = { email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };

      const result = await userCollection.updateOne(query, updateDoc, options);

      const accessToken = jwt.sign({ email }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d',
      });

      res.send({ result, accessToken });
    });

    // set admin role
    app.put(
      '/users/admin/:email',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;

        const query = { email };
        const updateDoc = {
          $set: { role: 'Admin' },
        };

        const result = await userCollection.updateOne(query, updateDoc);
        res.send(result);
      }
    );

    app.get('/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email });
      const isAdmin = user.role === 'Admin';

      res.send({ admin: isAdmin });
    });

    // doctor post api
    app.post('/doctor', verifyToken, verifyAdmin, async (req, res) => {
      const data = req.body;
      const result = await doctorCollection.insertOne(data);

      res.send(result);
    });

    // doctors api
    app.get('/doctors', verifyToken, async (req, res) => {
      const result = await doctorCollection.find().toArray();

      res.send(result);
    });

    // delete doctors
    app.delete('/doctor/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const query = { email };
      const result = await doctorCollection.deleteOne(query);

      res.send(result);
    });

    // Root Api
    app.get('/', (req, res) => {
      res.send('Welcome to doctors portal server');
    });

    app.listen(PORT, () => {
      console.log('doctors portal server is running');
    });
  } finally {
  }
};

run().catch(console.dir);
