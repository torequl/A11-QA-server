const express = require("express");
const cors = require("cors");
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

// middleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mti5t.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
    }
});

async function run() {
    try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const queryCollection = client.db("queryDB").collection("queries")
    const userCollection = client.db("queryDB").collection("user");

    app.get("/recent-queries", async (req, res) => {
        // const query = 
        const queries = queryCollection.find().sort({ timestamp: -1 }).limit(6);
        const result = await queries.toArray()
        res.send(result);
    });

    app.get('/my-queries', async (req, res) => {
        const queryEmail = req.query.email;
        const query = { userEmail: queryEmail };
        const result = await queryCollection.find(query).toArray();
        res.send(result)
    });

    app.post("/users", async (req, res) => {
        const newUser = req.body;
        const result = await userCollection.insertOne(newUser);
        res.send(result);
    });

    app.post("/add-query", async (req, res) => {
        const queryData = req.body;
        const result = await queryCollection.insertOne(queryData);
        res.send(result);
    });

    app.delete("/my-queries-delete/:id", async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id)};
        const result = await queryCollection.deleteOne(query);
        res.send(result);
    });
    
    } 


    finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
    }
}
run().catch(console.dir);




app.get("/", (req, res) => {
    res.send("Assignment 11 Is working server working fine");
});

app.listen(port, () => {
    console.log(`Assignment 11 running on port: ${port}`);
});
