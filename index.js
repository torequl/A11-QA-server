const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken")
const cookieParser = require("cookie-parser")
require("dotenv").config();
const port = process.env.PORT || 5000;
const app = express();
const SECRET_KEY = process.env.SECRET_KEY;

// middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://assignment-11qa.web.app'
    ],
    credentials: true,
    optionsSuccessStatus: 200,
}));
app.use(express.json());
app.use(cookieParser());


const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;
    
    if (!token) {
        return res.status(401).send({ message: "Unauthorized: No token provided" });
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: "Forbidden: Invalid token" });
        }
        req.user = decoded; // Attach user info to req
        next(); // Proceed to the next middleware or route handler
    });
}




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
    // // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const queryCollection = client.db("queryDB").collection("queries")

    const userCollection = client.db("queryDB").collection("user");

    const recommendationCollection = client.db("queryDB").collection("recommendation")


    // JWT APIs
    app.post('/jwt', async (req, res)=> {
        const email = req.body;
        const token = jwt.sign(email, SECRET_KEY, {expiresIn: '24h'})
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        }).send({success:'login'})

        // console.log(token);
    })

    // Delete Token
    app.get('/logout', (req, res) => {
        res.clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        }).send({success: 'logout'})
    });


    app.get("/recent-queries", async (req, res) => {
        const queries = queryCollection.find().sort({ timestamp: -1 }).limit(8);
        const result = await queries.toArray()
        res.send(result);
    });

    app.get("/all-queries", async (req, res) => {
        const queries = queryCollection.find().sort({ timestamp: -1 });
        const result = await queries.toArray()
        res.send(result);
    });

    app.get('/my-queries/:email', verifyToken, async (req, res) => {
        const decodedEmail = req.user?.email;
        const email = req.params.email;
        const query = { userEmail: email };

        if(decodedEmail !== email){
            return res.status(403).send({message: 'Forbidden Access'})
        }

        const result = await queryCollection.find(query).sort({ timestamp: -1 }).toArray();
        res.send(result)
    });

    app.get("/details/:id", async (req, res) => {
        const itemId = req.params.id;
        const query = { _id: new ObjectId(itemId) };
        const result = await queryCollection.findOne(query);
        res.send(result);
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


    app.post("/recommendation", async (req, res) => {
        const { queryId, recommendationEmail } = req.body;
    
        try {
          // Find the query in the database
            const query = await queryCollection.findOne({ _id: new ObjectId(queryId) });
            
            // Prevent users from recommending their own queries
            if (query.userEmail === recommendationEmail) {
                return res.status(403).send({ error: "You cannot recommend your own query." });
            }
        
            // Add the recommendation
            const result = await recommendationCollection.insertOne(req.body);
        
            // Increment the recommendation count
            await queryCollection.updateOne(
                { _id: new ObjectId(queryId) },
                { $inc: { recommendationCount: 1 } }
            );
        
            res.send(result);
        }   catch (error) {
            res.status(500).send({ error: "Failed to add recommendation", details: error.message });
        }
    });
    

    app.get("/recommendation", async (req, res) => {
        const queries = recommendationCollection.find();
        const result = await queries.toArray();
        res.send(result);
    });


    // My Recommendation
    app.get('/my-recommendation/:email', verifyToken, async (req, res) => {
        const email = req.params.email;
        const query = { recommendationEmail: email};

        if(req.user.email !== email){
            return res.status(403).send({message: 'Forbidden Access'})
        }

        const result = await recommendationCollection.find(query).toArray();
        res.send(result)
    });

    app.delete("/my-recommendation-delete/:id", async (req, res) => {
        const id = req.params.id;
    
        try {
          // Step 1: Find the recommendation document to get the associated queryId
        const recommendation = await recommendationCollection.findOne({ _id: new ObjectId(id) });

        if (!recommendation) {
            return res.status(404).send({ error: "Recommendation not found" });
        }

          const queryId = recommendation.queryId; // Extract queryId from the recommendation document
    
          // Step 2: Delete the recommendation document
        const deleteResult = await recommendationCollection.deleteOne({ _id: new ObjectId(id) });
    
          // Step 3: Decrement the recommendationCount in the queryCollection
        const update = { $inc: { recommendationCount: -1 } };
          const filter = { _id: new ObjectId(queryId) }; // Use queryId for the filter
        const updateCount = await queryCollection.updateOne(filter, update);
    
        res.send({ deleteResult, updateCount });
        } catch (error) {
        res.status(500).send({ error: "An error occurred", details: error.message });
        }
    });


    // API to fetch recommendations for the logged-in user's queries
    app.get("/recommendations-for-me/:email", verifyToken, async (req, res) => {
        const userEmail = req.params.email;

        if(req.user.email !== userEmail){
            return res.status(403).send({message: "Forbidden access" })
        }

        try {
            // Step 1: Find all queries created by the user
            const userQueries = await queryCollection.find({userEmail}).toArray();

            const queryIds = userQueries.map(query => query._id.toString()); // Extract query IDs

            // Step 2: Find recommendations for these queries
            const recommendations = await recommendationCollection.find({queryId: {$in: queryIds}}).toArray();

            res.send(recommendations);
        } catch (error) {
            res.status(500).send({
                error: "Failed to fetch recommendations",
                details: error.message
            });
        }
    });
    
    // Show All Recommendation Data
    app.get("/recommendations/:queryId", async (req, res) => {
        const queryId = req.params.queryId;
        try {
        // Find all recommendations matching the given queryId
        const recommendations = await recommendationCollection.find({ queryId }).toArray();

        res.send(recommendations);
        } catch (error) {
        res.status(500).send({ error: "Failed to fetch recommendations", details: error.message });
        }
    });


    app.delete("/my-queries-delete/:id", async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id)};
        const result = await queryCollection.deleteOne(query);
        res.send(result);
    });


    app.put("/update/:id", async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const options = { upsert: true };
        const updatedDoc = req.body;
        const updated = {
            $set: {
            boycottingReasonDetails: updatedDoc.boycottingReasonDetails,
            queryTitle: updatedDoc.queryTitle,
            productImageURL: updatedDoc.productImageURL,
            productBrand: updatedDoc.productBrand,
            productName: updatedDoc.productName,
            timestamp: updatedDoc.timestamp,
            },
        };
        const result = await queryCollection.updateOne(
            filter,
            updated,
            options
        );
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
