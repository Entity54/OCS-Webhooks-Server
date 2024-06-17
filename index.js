// node api/index
'use strict';
require('dotenv').config();
const express = require('express');
const http = require('http');  
const exphbs = require('express-handlebars');
const path = require('path');       
const moment = require('moment');  
const { createHmac } = require('crypto');   //Used in verifying incoming webhooks using signatures
const cors = require('cors');  // Import CORS

const port = process.env.PORT || 3002;

const app = express();
const server = http.createServer(app);

app.use(cors());  // Use CORS middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Storage for processed posts
let processedPosts = [];


// Set up Handlebars
app.engine('handlebars', exphbs.engine({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, './views'));

// Middleware for serving static files
app.use(express.static(path.join(__dirname, './public')));


app.get('/', (req, res) => {
  res.render('home', { posts: processedPosts });
});

//Endpoint to fetch latest posts
app.get('/latest-posts', (req, res) => {
  res.json(processedPosts);
});



app.post('/', async (req, res, next) => {
  const body = req.body;
  const timestamp = moment().format('YYYY-MM-DD HH:mm:ss'); // Format timestamp

  const sig = req.get("X-Neynar-Signature");
  if (sig)
  {
    console.log(`Received Webhook Signature: ${sig}`); 
    verifyWebhookSignature(body,sig);
  }
  else
  {
    console.log(`Webhook Signature missing from request headers`);
  }


  // Process the received data
  const post = {
    timestamp,
    created_at: body.created_at,
    type: body.type,
    data_object: body.data.object,
    parent_fid: body.data.parent_author.fid,
    author_object: body.data.author.object,
    author_fid: body.data.author.fid,
    author_username: body.data.author.username,
  };
  

  // Store the processed data
  processedPosts.unshift(post); // Add the new post to the beginning of the array

  // Keep only the latest 20 posts
  if (processedPosts.length > 20) {
    processedPosts = processedPosts.slice(0, 20);
  }

  // Respond with success message
  res.status(201).send('Post received and processed successfully');
});


console.log(`${new Date()} server is up`);
//#endregion




//#region MAIN PART

//#region Webhook Verification
const verifyWebhookSignature = (body,sig) => {
  console.log(`Verifying POST data`);  

  // const sig = req.get("X-Neynar-Signature");
  if (!sig) throw new Error("Neynar signature missing from request headers");

  const webhookSecret = process.env.NEYNAR_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("Make sure you set NEYNAR_WEBHOOK_SECRET in your .env file");

  const hmac = createHmac("sha512", webhookSecret);

  const bodytext = JSON.stringify(body);
  hmac.update(bodytext);

  const generatedSignature = hmac.digest("hex");

  const isValid = generatedSignature === sig;
  if (!isValid) throw new Error("Invalid webhook signature");


  analyseWebhookData(body)
};
//#region

const analyseWebhookData = (body) => {
  console.log(`Analysing POST body data`);  

  if (body.type === "cast.created") {
    handle_CastCreated(body.data, body.created_at);
  }
};



const handle_CastCreated = async (data, created_at) => {
  console.log(`handle_CastCreated: New Cast Created ${created_at}`);
  console.log(data);
}




//#endregion


server.listen(port, () => {
  console.log(`Webhook Server is up on port ${port}`);
});