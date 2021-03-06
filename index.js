const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const app = express();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// mongodb connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster-warehouse-manag.bfvdp.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// Stripe payment
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// JWT verify
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();
        const productCollection = client.db('pc-components-manufacturer').collection('items');
        const reviewCollection = client.db('pc-components-manufacturer').collection('reviews');
        const userCollection = client.db('pc-components-manufacturer').collection('users');
        const orderCollection = client.db('pc-components-manufacturer').collection('orders');

        // Get all products
        app.get('/products', async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query).sort({ '_id': -1 });
            const products = await cursor.toArray();
            res.send(products);
        });

        // Add a new item
        app.post('/product', verifyJWT, async (req, res) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const item = req.body;
                item.price = parseFloat(item.price);
                item.stock = parseInt(item.stock);
                item.moq = parseInt(item.moq);
                const result = await productCollection.insertOne(item);
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        });

        // Delete item
        app.delete('/product/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { _id: ObjectId(id) };
                const result = await productCollection.deleteOne(filter);
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        });

        // Update item stock quantity
        app.patch('/product/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const newStock = parseInt(req.body.value);
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { _id: ObjectId(id) };
                const updateDoc = {
                    $set: { stock: newStock }
                };
                const result = await productCollection.updateOne(filter, updateDoc);
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        });

        // New order & update item stock, sold field
        app.post('/order', verifyJWT, async (req, res) => {
            const order = req.body.formData;
            const item = order.productID;
            const newStock = req.body.newStock;
            const newSold = req.body.newSold;
            const filter = { _id: ObjectId(item) };
            const updateDoc = {
                $set: { stock: newStock, sold: newSold }
            };

            const addOrder = await orderCollection.insertOne(order);
            const updateProduct = await productCollection.updateOne(filter, updateDoc)

            res.send({ addOrder, updateProduct });
        });

        //Payment API
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const item = req.body;
            const amount = item.price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: [
                    "card"
                ]
            });

            res.send({ clientSecret: paymentIntent.client_secret, });
        });

        //Update order after successful payment
        app.put('/payment/order/:id', verifyJWT, async (req, res) => {
            const id = req.params;
            const orderToUpdate = req.body;
            const newStatus = orderToUpdate.newStatus;
            const newPaymentStatus = orderToUpdate.newPaymentStatus;
            const transactionID = orderToUpdate.transactionID;
            const filter = { _id: ObjectId(id) };
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    status: newStatus,
                    paymentStatus: newPaymentStatus,
                    transactionID: transactionID
                }
            };

            const result = await orderCollection.updateOne(filter, updateDoc, options);
            res.send(result);
        });

        //Get all orders
        app.get('/orders', verifyJWT, async (req, res) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const query = {};
                const result = await orderCollection.find(query).toArray();
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        });

        //Get a single order
        app.get('/payment/order/:id', verifyJWT, async (req, res) => {
            const id = req.params;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.findOne(query);
            res.send(result);
        });

        //Update order status
        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params;
            const newStatus = req.body.newStatus;
            const filter = { _id: ObjectId(id) };
            const updateDoc = {
                $set: { status: newStatus }
            };
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const result = await orderCollection.updateOne(filter, updateDoc);
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        });

        //Get orders of a specific user
        app.get('/orders/:email', verifyJWT, async (req, res) => {
            const user = req.params.email;
            const filter = { customerEmail: user };
            const result = await orderCollection.find(filter).toArray();
            res.send(result);
        });

        //Delete an order
        app.delete('/orders/:id', verifyJWT, async (req, res) => {
            const order = req.params.id;
            const item = req.body.itemID;
            const adjustStock = req.body.adjustStock;
            const adjustSold = req.body.adjustSold;
            const filter = { _id: ObjectId(order) };
            const filterItem = { _id: ObjectId(item) };
            const updateDoc = {
                $set: { stock: adjustStock, sold: adjustSold }
            };

            const deleteOrder = await orderCollection.deleteOne(filter);
            const adjustItem = await productCollection.updateOne(filterItem, updateDoc);
            res.send({ deleteOrder, adjustItem });
        });

        // Create & update an user
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user
            };
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' });
            const result = await userCollection.updateOne(filter, updateDoc, options);
            res.send({ result, token });
        });


        // Get all the user
        app.get('/users', verifyJWT, async (req, res) => {
            const query = {};
            const users = await userCollection.find(query).toArray();
            res.send(users);
        });

        // Get a single user details
        app.get('/user/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const decodedEmail = req.decoded.email;
            if (decodedEmail === email) {
                const filter = { email: email };
                const result = await userCollection.findOne(filter);
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' })
            }
        });

        // Make a user admin
        app.patch('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' }
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                return res.send(result);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }
        });

        //Check admin
        app.get('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin });
        });

        // Get all reviews
        app.get('/reviews', async (req, res) => {
            const query = {};
            const cursor = reviewCollection.find(query);
            const reviews = await cursor.toArray();
            res.send(reviews);
        });

        // Add a review
        app.post('/review', verifyJWT, async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });
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