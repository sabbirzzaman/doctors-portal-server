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

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

const run = async () => {
    await client.connect()

    try{
        const treatmentCollection = client.db('doctors-collection').collection('treatment')

        // treatment API
        app.get('/treatments', async (req, res) => {
            const query = {};
            const cursor = treatmentCollection.find(query)

            const result = await cursor.toArray();
            res.send(result)
        })
    }
    finally{}
}

run().catch(console.dir)

// Root Api
app.get('/', (req, res) => {
    res.send('Welcome to doctors portal server');
});

app.listen(port, () => {
    console.log('doctors portal server is running');
});
