const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster-warehouse-manag.bfvdp.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const productCollection = client.db('pc-components-manufacturer').collection('items');
        const reviewCollection = client.db('pc-components-manufacturer').collection('reviews');
        const userCollection = client.db('pc-components-manufacturer').collection('users');
        const orderCollection = client.db('pc-components-manufacturer').collection('orders');


    }
    finally { }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send("PC Component server is running...")
});

app.listen(port, () => {
    console.log(`Manufacturer Server is running on ${port}`)
})