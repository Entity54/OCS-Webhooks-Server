// Must have a .env file with the following variables process.env.NEYNAR_WEBHOOK_SECRET
// node index.js
'use strict';
require('dotenv').config();
const express = require('express');
const http = require('http');  
const exphbs = require('express-handlebars');
const path = require('path');       
// const moment = require('moment');  
const { createHmac } = require('crypto');   //Used in verifying incoming webhooks using signatures
const cors = require('cors');  // Import CORS


//#region ************************** Smart Contracts Setup **************************
const { ethers, Wallet } = require("ethers");
// ************************** Import ABIs **************************
const CampaignManager_raw = require('./Abis/CampaignManager.json');
const InfuencersManager_raw = require('./Abis/InfluencersManager.json');
const CampaignAssets_raw = require('./Abis/CampaignAssets.json');
const SquawkProcessor_raw = require('./Abis/SquawkProcessor.json');
const deploymentData = require('./DeploymentData.json');

// import CampaignManager_raw from './Abis/CampaignManager.json';  
// import InfuencersManager_raw from './Abis/InfluencersManager.json';
// import CampaignAssets_raw from './Abis/CampaignAssets.json';
// import deploymentData from "./DeploymentData.json";


// ************************** KEYS **************************//
const RPC_BASE_KEY = process.env.VITE_RPC_BASE_KEY;
const PRIVATE_KEY = process.env.VITE_PRIVATE_KEY;
const public_signer = new Wallet(PRIVATE_KEY);   
// ************************** //

//#region ************************** Set up Chains **************************
const chainSpecs = {
	84532: {
		chainName: "base-sepolia",
		chainId: 84532,
		rpc: `https://api.developer.coinbase.com/rpc/v1/base-sepolia/${RPC_BASE_KEY}`,  //"https://sepolia.base.org",
		chainProvider: "", 
		chainWallet: "", //public_signer.connect(chainProvider),
		contracts: {
			CampaignManager: "", 
			InfuencersManager:"", 
      CampaignAssets: "",
      SquawkProcessor:"",
		},
	},
  8453: {
		chainName: "base",
		chainId: 8453,
		rpc: `https://api.developer.coinbase.com/rpc/v1/base/${RPC_BASE_KEY}`,
		chainProvider: "",  
		chainWallet: "", 
		contracts: {
			CampaignManager: "", 
			InfuencersManager:"", 
      CampaignAssets: "",
      SquawkProcessor:"",
		},
	},
}
//#endregion ************************** Set up Chains **************************

//#region ************************** Set up Contracts **************************
const setupContracts = async () => {
	Object.keys(chainSpecs).forEach( async (chainId) => {
		const chain = chainSpecs[chainId];
		chain.chainProvider = new ethers.providers.JsonRpcProvider(chain.rpc);
		chain.chainWallet = public_signer.connect(chain.chainProvider);
		if (Object.keys(deploymentData["CampaignManager"]).includes(chain.chainName))
		{
			chain.contracts =
			{
				CampaignManager: new ethers.Contract( deploymentData["CampaignManager"][chain.chainName]["address"] , CampaignManager_raw.abi , chain.chainWallet ), 
				InfuencersManager: new ethers.Contract( deploymentData["InfuencersManager"][chain.chainName]["address"] , InfuencersManager_raw.abi , chain.chainWallet ),
				CampaignAssets: new ethers.Contract( deploymentData["CampaignAssets"][chain.chainName]["address"] , CampaignAssets_raw.abi , chain.chainWallet ),
				SquawkProcessor: new ethers.Contract( deploymentData["SquawkProcessor"][chain.chainName]["address"] , SquawkProcessor_raw.abi , chain.chainWallet ),
			};

		} else chain.contracts = {};
	})
}
//#endregion ************************** Set up Contracts **************************


let provider_Admin, CampaignManager_admin, InfuencersManager_admin, CampaignAssets_admin, SquawkProcessor_admin;
//#endregion ************************** Smart Contracts Setup **************************


//#region Webhook Secrets for verifications
const NEYNAR_WEBHOOK_SECRET_NGROK = process.env.NEYNAR_WEBHOOK_SECRET_NGROK
const NEYNAR_WEBHOOK_SECRET_SEPOLIA = process.env.NEYNAR_WEBHOOK_SECRET_SEPOLIA
const NEYNAR_WEBHOOK_SECRET_BASE = process.env.NEYNAR_WEBHOOK_SECRET_BASE
//#endregion


const port = process.env.PORT || 3002;

const base = "https://api.neynar.com/";
const apiKey = process.env.NEYNAR_API_KEY;

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
  console.log(` *******> body: `,body);

  // const timestamp = moment().format('YYYY-MM-DD HH:mm:ss'); // Format timestamp

  const run_verifications = async (body,req) => {
      let _postActions = [];

      const sig = req.get("X-Neynar-Signature");
      if (sig)
      {
        console.log(`Received Webhook Signature: ${sig}`); 
        _postActions = await verifyWebhookSignature(body,sig);
        // console.log(`_postActions 1: `,_postActions);
      }
      else
      {
        console.log(`Webhook Signature missing from request headers`);
      }
      return _postActions;
  };
  const postActions = await run_verifications(body,req);

  // // Process the received data
  // const post = {
  //   timestamp,
  //   created_at: body.created_at, //this is in secs
  //   // type: body.type,   //sc
  //   // data_object: body.data.object,
  //   // parent_fid: "", //body.data.parent_author.fid,
  //   // author_object: "", //body.data.author.object,
  //   // author_fid: "", //body.data.author.fid,
  //   // author_username: "", //body.data.author.username,
  // };
  


  // Store the processed data
  processedPosts.unshift(...postActions); // Add the new post to the beginning of the array
  // processedPosts.unshift(post); // Add the new post to the beginning of the array

  // Keep only the latest 20 posts
  if (processedPosts.length > 20) {
    processedPosts = processedPosts.slice(0, 20);
  }

  console.log(`THIS PRINTS AT THE END OF PROCESSING DATA`);

  // Respond with success message
  res.status(201).send('Post received and processed successfully');
});


console.log(`${new Date()} server is up`);
//#endregion




//#region MAIN PART

//#region Webhook Verification
const verifyWebhookSignature = async (body,sig) => {
  console.log(`Verifying POST data`);  

  // const sig = req.get("X-Neynar-Signature");
  if (!sig) throw new Error("Neynar signature missing from request headers");

  // const webhookSecret = process.env.NEYNAR_WEBHOOK_SECRET;
  // if (!webhookSecret) throw new Error("Make sure you set NEYNAR_WEBHOOK_SECRET in your .env file");

  let hmac_NGROK, hmac_SEPOLIA, hmac_BASE;
  // const hmac = createHmac("sha512", webhookSecret);
  hmac_NGROK = createHmac("sha512", NEYNAR_WEBHOOK_SECRET_NGROK);
  hmac_SEPOLIA = createHmac("sha512", NEYNAR_WEBHOOK_SECRET_SEPOLIA);
  hmac_BASE = createHmac("sha512", NEYNAR_WEBHOOK_SECRET_BASE);

  const bodytext = JSON.stringify(body);

  // hmac.update(bodytext);
  hmac_NGROK.update(bodytext);
  hmac_SEPOLIA.update(bodytext);
  hmac_BASE.update(bodytext);

  // const generatedSignature = hmac.digest("hex");
  const generatedSignature_NGROK = hmac_NGROK.digest("hex");
  const generatedSignature_SEPOLIA = hmac_SEPOLIA.digest("hex");
  const generatedSignature_BASE = hmac_BASE.digest("hex");

  let chainObject, isValid = false;
  if (generatedSignature_NGROK===sig) {
    isValid = true;
    chainObject = chainSpecs[84532];
    console.log(`Detected NGROK Signature => Pointing to 84532`);
  }
  else if (generatedSignature_SEPOLIA===sig) {
    isValid = true;
    chainObject = chainSpecs[84532];
    console.log(`Detected Base-Sepolia Signature => Pointing to 84532`);
  }
  else if (generatedSignature_BASE===sig) {
    isValid = true;
    chainObject = chainSpecs[8453];
    console.log(`Detected Base Signature => Pointing to 8453`);
  }


  // const isValid = generatedSignature === sig;
  // if (!isValid) throw new Error("Invalid webhook signature");
  if (!isValid) 
  {
    console.log("Invalid webhook signature");
    return [];
  }
  else {
    provider_Admin 			    = chainObject.chainProvider;
    CampaignManager_admin 	= chainObject.contracts.CampaignManager;
    InfuencersManager_admin = chainObject.contracts.InfuencersManager;
    CampaignAssets_admin    = chainObject.contracts.CampaignAssets;
    SquawkProcessor_admin   = chainObject.contracts.SquawkProcessor;
  }
   


  //Test
  // const pendingCampaignUIDs = await getPendingCampaigns();  //DELETE ONLY FOr TESTING
  // console.log(`verifyWebhookSignature pendingCampaignUIDs: `,pendingCampaignUIDs);  //DELETE ONLY FOr TESTING
  // await getSquawkBoxElementRange();    //DELETE ONLY FOr TESTING
  


  console.log(`verifyWebhookSignature Moving on to analyseWebhookData`);

  const postActions = await analyseWebhookData(body);
  // console.log(`postActions 2: `,postActions);

  return postActions;
};
//#endregion

const analyseWebhookData = async (body) => {
  let postActions = [];
  let for_smartcontract = [];


  //GET ACTIVE CAMPIGN FIDs
  const campaign_fids = await getActiveCampaignFIDs(); //For Live
  // const campaign_fids=[723628]; //Example For testing
 

  console.log(`Analysing POST body data body: `);  

  if (body.type === "cast.created") {
    const { features, for_sc } = await handle_CastCreated(body.data, body.created_at, campaign_fids);
    if (for_sc.length>0)
    {
      // console.log(`CASE cast.created features: `,features);
      postActions.push(...features);
      for_smartcontract.push(...for_sc);
    }
  }
  else if (body.type === "follow.created") {
    const { features, for_sc } = await handle_Follow(body.data, body.created_at, campaign_fids);
    if (for_sc)
    {
      postActions.push(features);
      for_smartcontract.push(for_sc);
    }
  }
  else if (body.type === "follow.deleted") {
    const { features, for_sc } = await handle_Unfollow(body.data, body.created_at, campaign_fids);
    if (for_sc)
    {
      postActions.push(features);
      for_smartcontract.push(for_sc);
    }
  }
  else if (body.type === "reaction.created") {
    const { features, for_sc } = await handle_Reaction_Created(body.data, body.created_at, campaign_fids);
    if (for_sc)
    {
      postActions.push(features);
      for_smartcontract.push(for_sc);
    }
  }
  else if (body.type === "reaction.deleted") {
    const { features, for_sc } = await handle_Reaction_Deleted(body.data, body.created_at, campaign_fids);
    if (for_sc)
    {
      postActions.push(features);
      for_smartcontract.push(for_sc);
    }
  }
  else {
    console.log(`*** Unknown webhook type ***: ${body.type}`);
  }


  console.log(`analyseWebhookData => postActions: `,postActions);
  console.log(`analyseWebhookData => for_smartcontract: `,for_smartcontract);

  recordData_on_SquawkProcessor(for_smartcontract);

  return postActions;
};





//#region Case 1: A user follows company account
const handle_Follow = async (data, created_at, campaign_fids) => {
  console.log(`handle_Follow: New Follow created_at: ${created_at} data: `,data);

  //#region
  // const msg_object  = data.object; //'follow'    //sc //TODO categorise body.type in  => 7 categories
  // const msg_timestamp = data.timestamp; //'2024-06-17T19:46:17.000Z'
  // console.log(`handle_Follow: New Follow data.timestamp: ${data.timestamp}`);
  // const user_object  = data.user.object; //'user_dehydrated'
  // const user_fid  = data.user.fid; //'679934'
  // const user_username  = data.user.username; //'artemishunter'
  // const user_follows_account_object  = data.target_user.object; //'user_dehydrated'
  // const user_follows_account_fid  = data.target_user.fid; //'620429'
  // const user_follows_account_username  = data.target_user.username; //'swkrates'
  //#endregion


  const user_fid = data.user.fid;
  const user_followed = data.target_user.fid;
  
  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  
  const campaign_registered_infuencers_fids = await getCampaign_Infuencers_From_Fid(user_followed); //For Live
  // const campaign_registered_infuencers_fids = [620429]; //Example  For Testing

  const foundUserFIDIndex = campaign_registered_infuencers_fids.findIndex(fid => `${fid}`===`${user_fid}`);
  if (foundUserFIDIndex === -1) {
    console.log(`user_fid: ${user_fid} not a registered infuencer for campaign fid: ${user_followed} `);
    return {features: null, for_sc: null};
  }
  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  
  
  
  const user_followers = await getUserInfo_withFids_Bulk([user_fid]); // ***** GET USER'S NUMBER OF FOLLOWERS
  
  let features, for_sc;

  let foundIndex = campaign_fids.findIndex(fid => `${fid}`===`${user_followed}`);
  if (foundIndex !== -1) {
    console.log(`handle_Follow The user_followed "${user_followed}" appears in the campaign_fids at position ${foundIndex} in campaign_fids.`);

    features = {
      created_at,
      humantime:  data.timestamp,
      action: "follow", //14
      user_fid,
      user_username: data.user.username,
      user_followers,
      user_followed,
      user_name_followed: data.target_user.username
    };

    // for_sc = [created_at, 14, user_fid, user_followed, user_followers];
    for_sc = {
        data: [user_followed],
        created_at,
        code: 14,
        user_fid,
        user_followers,
        cast_hash: "0x0000000000000000000000000000000000000000",  
        replyTo_cast_hash:  "0x0000000000000000000000000000000000000000" ,
        embeded_string: "",
        nonce: 0,
        processed: 0,
    };




  } else {
    console.log(`handle_Follow The user_followed "${user_followed}" is not in the campaign_fids.`);
  }

  console.log(`***** features: `,features);
  console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};
}
//#endregion

//#region Case 2: A user unfollows company account
const handle_Unfollow = async (data, created_at, campaign_fids) => {
  console.log(`handle_Unfollow: New Unfollow created_at: ${created_at} data: `,data);
  
  //#region
  // const msg_object  = data.object; //'unfollow'
  // const msg_timestamp = data.timestamp; //'2024-06-17T19:38:14.000Z'
  // const user_object  = data.user.object; //'user_dehydrated'
  // const user_fid  = data.user.fid; //'679934'
  // const user_username  = data.user.username; //'artemishunter'
  // const user_unfollows_account_object  = data.target_user.object; //'user_dehydrated'
  // const user_unfollows_account_fid  = data.target_user.fid; //'620429'
  // const user_unfollows_account_username  = data.target_user.username; //'swkrates'
  //#endregion

  const user_fid = data.user.fid;
  const user_unfollowed = data.target_user.fid;

  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  
  const campaign_registered_infuencers_fids = await getCampaign_Infuencers_From_Fid(user_unfollowed); 
  // const campaign_registered_infuencers_fids = [620429]; //Example  

  const foundUserFIDIndex = campaign_registered_infuencers_fids.findIndex(fid => `${fid}`===`${user_fid}`);
  if (foundUserFIDIndex === -1) {
    console.log(`user_fid: ${user_fid} not a registered infuencer for campaign fid: ${user_unfollowed} `);
    return {features: null, for_sc: null};
  }
  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  


  const user_followers = await getUserInfo_withFids_Bulk([user_fid]); // ***** GET USER'S NUMBER OF FOLLOWERS
  
  let features, for_sc;

  let foundIndex = campaign_fids.findIndex(fid => `${fid}`===`${user_unfollowed}`);
  if (foundIndex !== -1) {
    console.log(`handle_Unfollow The user_unfollowed "${user_unfollowed}" appears in the campaign_fids at position ${foundIndex} in campaign_fids.`);

    features = {
      created_at,
      humantime:  data.timestamp,
      action: "unfollow", //15
      user_fid,
      user_username: data.user.username,
      user_followers,
      user_unfollowed,
      user_name_unfollowed:  data.target_user.username
    };

    // for_sc = [created_at, 15, user_fid, user_unfollowed, user_followers];
    for_sc = {
        data: [user_unfollowed],
        created_at,
        code: 15,
        user_fid,
        user_followers,
        cast_hash: "0x0000000000000000000000000000000000000000",  
        replyTo_cast_hash:  "0x0000000000000000000000000000000000000000" ,
        embeded_string: "",
        nonce: 0,
        processed: 0,
    };


  } else {
    console.log(`handle_Unfollow The user_unfollowed "${user_unfollowed}" is not in the campaign_fids.`);
  }

  console.log(`***** features: `,features);
  console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};
}
//#endregion




//#region Case 3: A user REACTION of a company CAST
const handle_Reaction_Created = async (data, created_at, campaign_fids) => {
  console.log(`handle_Reaction New Reaction created_at: ${created_at} data: `,data);

  //#region
  // console.log(`handle_Reaction_Created author: `,data.cast.author);
  // const msg_object  = data.object; //'reaction'
  // const msg_timestamp = data.timestamp; //'2024-06-17T19:46:17.000Z'
  // const reaction_type  = data.reaction_type; // 1:'like' 2:'recast'
  // const user_object  = data.user.object; //'user_dehydrated'
  // const user_fid  = data.user.fid; //'679934'
  // const user_username  = data.user.username; //'artemishunter'

  // const cast_object  = data.cast.object; //'cast_dehydrated'
  // const cast_hash  = data.cast.hash; //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
  // const cast_author_object  = data.cast.author.object; //'user_dehydrated'
  // const cast_author_fid  = data.cast.author.fid; //'620429'
  // const cast_author_username  = data.cast.author.username; //'swkrates'
  //#endregion

  
  const user_fid = data.user.fid;
  const cast_author_fid = data.cast.author.fid;

  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  
  const campaign_registered_infuencers_fids = await getCampaign_Infuencers_From_Fid(cast_author_fid); 
  // const campaign_registered_infuencers_fids = [620429]; //Example  

  const foundUserFIDIndex = campaign_registered_infuencers_fids.findIndex(fid => `${fid}`===`${user_fid}`);
  if (foundUserFIDIndex === -1) {
    console.log(`user_fid: ${user_fid} not a registered infuencer for campaign fid: ${cast_author_fid} `);
    return {features: null, for_sc: null};
  }
  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  



  const user_followers = await getUserInfo_withFids_Bulk([user_fid]); // ***** GET USER'S NUMBER OF FOLLOWERS
  
  let features, for_sc;

  let foundIndex = campaign_fids.findIndex(fid => `${fid}`===`${cast_author_fid}`);
  if (foundIndex !== -1) {
    console.log(`handle_Reaction_Created The cast_author_fid "${cast_author_fid}" appears in the campaign_fids at position ${foundIndex} in campaign_fids.`);

    features = {
      created_at,
      humantime:  data.timestamp,
      action: "reaction", 
      reaction_type: data.reaction_type === 1 ? "like" : "recast", // 1:'like' 2:'recast' // 16, 17
      user_fid,
      user_username: data.user.username,
      user_followers,
      cast_hash: data.cast.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
      cast_author_fid, // "723628" , '620429'
      cast_author_username: data.cast.author.username, //'swkrates'
    };

    // for_sc = [created_at, (data.reaction_type === 1? 16 : 17), user_fid, data.cast.hash, cast_author_fid, user_followers]
    for_sc = {
        data: [cast_author_fid],
        created_at,
        code: (data.reaction_type === 1? 16 : 17),
        user_fid,
        user_followers,
        cast_hash: data.cast.hash,  
        replyTo_cast_hash:  "0x0000000000000000000000000000000000000000" ,
        embeded_string: "",
        nonce: 0,
        processed: 0,
    };




  } else {
    console.log(`handle_Reaction_Created The cast_author_fid "${cast_author_fid}" is not in the campaign_fids.`);
  }

  console.log(`***** features: `,features);
  console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};
}
//#endregion

//#region Case 4: A user REACTION is DELETED on a company CAST
const handle_Reaction_Deleted = async (data, created_at, campaign_fids) => {
  console.log(`handle_Reaction_Deleted created_at: ${created_at} data: `,data);


  //#region
  // console.log(`handle_Reaction_Deleted author: `,data.cast.author);
  // console.log(`handle_Reaction_Deleted created_at: ${created_at}`);
  // const msg_object  = data.object; //'reaction'
  // const msg_timestamp = data.timestamp; //'2024-06-17T19:46:17.000Z'
  // const reaction_type  = data.reaction_type; // 1:'unlike'
  // const user_object  = data.user.object; //'user_dehydrated'
  // const user_fid  = data.user.fid; //'679934'
  // const cast_object  = data.cast.object; //'cast_dehydrated'
  // const cast_hash  = data.cast.hash; //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
  // const cast_author_object  = data.cast.author.object; //'user_dehydrated'
  // const cast_author_fid  = data.cast.author.fid; //'620429'
  // const cast_author_username  = data.cast.author.username; //'swkrates'
  //#endregion


  const user_fid = data.user.fid;
  const cast_author_fid = data.cast.author.fid;

  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  
  const campaign_registered_infuencers_fids = await getCampaign_Infuencers_From_Fid(cast_author_fid); 
  // const campaign_registered_infuencers_fids = [620429]; //Example  

  const foundUserFIDIndex = campaign_registered_infuencers_fids.findIndex(fid => `${fid}`===`${user_fid}`);
  if (foundUserFIDIndex === -1) {
    console.log(`user_fid: ${user_fid} not a registered infuencer for campaign fid: ${cast_author_fid} `);
    return {features: null, for_sc: null};
  }
  //*** SC GET INFLUENCERS FOR CAMPAIGN FID  user_followed  


  const user_followers = await getUserInfo_withFids_Bulk([user_fid]); // ***** GET USER'S NUMBER OF FOLLOWERS

  let features, for_sc;
  let foundIndex = campaign_fids.findIndex(fid => `${fid}`===`${cast_author_fid}`);
  if (foundIndex !== -1) {
    console.log(`handle_Reaction_Deleted The cast_author_fid "${cast_author_fid}" appears in the campaign_fids at position ${foundIndex} in campaign_fids.`);

    features = {
      created_at,
      humantime:  data.timestamp,
      action: "reaction", 
      reaction_type: data.reaction_type === 1 ? "unlike" : "re-cast deleted", // 1:'unlike' 2: delete re-cast  // 18,19
      user_fid,
      user_username: data.user.username,
      user_followers,
      cast_hash: data.cast.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
      cast_author_fid, // "723628" , '620429'
      cast_author_username: data.cast.author.username, //'swkrates'
    };

    // for_sc = [created_at, (data.reaction_type === 1? 18 : 19), user_fid, data.cast.hash, cast_author_fid, user_followers]
    for_sc = {
        data: [cast_author_fid],
        created_at,
        code: (data.reaction_type === 1? 18 : 19),
        user_fid,
        user_followers,
        cast_hash: data.cast.hash,
        replyTo_cast_hash:  "0x0000000000000000000000000000000000000000" ,
        embeded_string: "",
        nonce: 0,
        processed: 0,
    };






  } else {
    console.log(`handle_Reaction_Deleted The cast_author_fid "${cast_author_fid}" is not in the campaign_fids.`);
  }

  console.log(`***** features: `,features);
  console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};
}
//#endregion




//#region
const handle_CastCreated = async (data, created_at, campaign_fids ) => {
    
  //#region Get data from smart contracts 
  const campaign_urls = await get_embeds(); //For Live
  // const campaign_urls=["https://www.example3-dream-cars.com"
  // ,"https://www.example1-dream-cars.com","https://www.example5-dream-cars.com"]; //Example For testing


  const taglinesArray = await get_tagLines(); //For Live
  // const taglinesArray=["Yolo Dream Cars3","Yolo Dream Cars1","Yolo Dream Cars5"]; //Example For testing
  //#endregion




  console.log(`handle_CastCreated: New Cast Created ${created_at} data: `,data);

  //#region
  // console.log(`handle_CastCreated author.profile: `,data.author.profile);
  // console.log(`handle_CastCreated author.verified_addresses: `,data.author.verified_addresses);
  // console.log(`handle_CastCreated data.embeds: `,data.embeds);
  // console.log(`handle_CastCreated data.author.verifications: `,data.author.verifications);
  // console.log(`handle_CastCreated data.reactions.likes: `,data.reactions.likes);
  // console.log(`handle_CastCreated data.reactions.recasts: `,data.reactions.recasts);
  // console.log(`handle_CastCreated data.mentioned_profiles: `,data.mentioned_profiles);
  
  // const cast_object  = data.object; //'cast'
  // const action =data.object; //'cast'
  // const cast_hash  = data.hash; //'0x40fc98edca8f50b1b565978a44aeb05a318a09a5'
  //#endregion


  let featuresArray = [], for_scArray = [];
  const cast_text = data.text;
  const user_followers = data.author.follower_count;

  
  // *** CASE 1 REPLY ***
  // const cast_parent_hash  = data.parent_hash; //'null' //***  IF IT IS A REPLY THIS IS THE CAST HASH IT REPLIES TO
  // const cast_parent_author_fid  = data.parent_author.fid; //'null' //***  IF IT IS A REPLY THIS IS THE COMPANY FID THAT CASTED THE CAST IT REPLIES TO
  if (data.parent_hash) {
    const user_fid = data.author.fid;
    const replyToAuthorFid = data.parent_author.fid

    let foundIndex = campaign_fids.findIndex( fid => `${fid}`===`${replyToAuthorFid}`);
    if (foundIndex !== -1) {
          console.log(`This is a reply and replyToAuthorFid: "${replyToAuthorFid}" appears in the campaign_fids at position ${foundIndex} in campaign_fids.`);

          //*** SC GET INFLUENCERS FOR CAMPAIGN FID     
          const campaign_registered_infuencers_fids = await getCampaign_Infuencers_From_Fid(replyToAuthorFid); 
          // const campaign_registered_infuencers_fids = [620429]; //Example  

          const foundUserFIDIndex = campaign_registered_infuencers_fids.findIndex(fid => `${fid}`===`${user_fid}`);
          if (foundUserFIDIndex !== -1) {
          //*** SC GET INFLUENCERS FOR CAMPAIGN FID    

              console.log(`user_fid: ${user_fid} is a registered infuencer for campaign fid: ${replyToAuthorFid} `);

              let features = {
                created_at,
                humantime:  data.timestamp,
                action: "cast",  
                action_type: "reply",  // 20
                user_fid,
                user_username: data.author.username,
                user_followers,
                cast_hash: data.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
                replyToMessageHash:  data.parent_hash, //'620429'
                replyToAuthorFid,
                cast_text,
              };



              // let for_sc = [created_at, 20, user_fid, data.hash,  data.parent_hash, replyToAuthorFid, user_followers]
              let for_sc = {
                  data: [replyToAuthorFid],
                  created_at,
                  code: 20,
                  user_fid,
                  user_followers,
                  cast_hash: data.hash, 
                  replyTo_cast_hash: data.parent_hash,
                  embeded_string: "",
                  nonce: 0,
                  processed: 0
              };





              featuresArray.push(features);
              for_scArray.push(for_sc);

          } else {
            console.log(`user_fid: ${user_fid} is not a registered infuencer for campaign fid: ${replyToAuthorFid} `);
          }

    } else {
      console.log(`The replyToAuthorFid: "${replyToAuthorFid}"  is not in the campaign_fids.`);
    }

  }
  
  // *** CASE 2 Embeds ***
  // const cast_embeds  = data.embeds; //'[]'
  //enforce infuencer to embed only 1 url if any  in the cast, the campaign company url
  if (data.embeds.length === 1 && campaign_urls.length>0) {
    const embedsArray = data.embeds;
    const embed = embedsArray[0].url;

    let foundIndex = campaign_urls.findIndex(url => url===embed);
    if (foundIndex !== -1) {
      console.log(`The embed "${embed}" appears in the campaign_urls at position ${foundIndex} in campaign_urls.`);
    
      let features = {
        created_at,
        humantime:  data.timestamp,
        action: "cast",  
        action_type: "embed",  // 21
        user_fid: data.author.fid,
        user_username: data.author.username,
        user_followers,
        cast_hash: data.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
        embed,
        cast_text,
      };


      // let for_sc = [created_at, 21, data.author.fid, data.hash, embed, user_followers]
      let for_sc = {
          data: [],
          created_at,
          code: 21,
          user_fid: data.author.fid,
          user_followers,
          cast_hash: data.hash, 
          replyTo_cast_hash:  "0x0000000000000000000000000000000000000000" ,
          embeded_string: embed,
          nonce: 0,
          processed: 0
      };


  
      featuresArray.push(features);
      for_scArray.push(for_sc);
    } else {
      console.log(`The embed "${embed}" is not in the campaign_urls.`);
    }

  }


  // *** CASE 3 Mentions ***
  //enforce infuencer to mention only 1 fid if any in the cast, the campaign company fid
  if (data.mentioned_profiles.length === 1) {
    const mentionedFids = data.mentioned_profiles.map(profile => profile.fid);
    const mentionedFid = mentionedFids[0];  
    
    const user_fid = data.author.fid;

    const mentionedUserNames = data.mentioned_profiles.map(profile => profile.username);
    const mentionedUserName =  mentionedUserNames[0];

    let foundIndex = campaign_fids.findIndex(fid => `${fid}`===`${mentionedFid}`);
    if (foundIndex !== -1) {
        console.log(`The mentionedFid "${mentionedFid}" appears in the campaign_fids at position ${foundIndex} in campaign_fids.`);

        //*** SC GET INFLUENCERS FOR CAMPAIGN FID     
        const campaign_registered_infuencers_fids = await getCampaign_Infuencers_From_Fid(mentionedFid); 
        // const campaign_registered_infuencers_fids = [620429]; //Example  


        const foundUserFIDIndex = campaign_registered_infuencers_fids.findIndex(fid => `${fid}`===`${user_fid}`);
        if (foundUserFIDIndex !== -1) {
        //*** SC GET INFLUENCERS FOR CAMPAIGN FID    
                console.log(`user_fid: ${user_fid} is a registered infuencer for campaign fid: ${mentionedFid} `);

                let features = {
                  created_at,
                  humantime:  data.timestamp,
                  action: "cast",  
                  action_type: "mentioned",  // 22
                  user_fid,
                  user_username: data.author.username,
                  user_followers,
                  cast_hash: data.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
                  mentionedFid,
                  mentionedUserName,
                  cast_text,
                };



                // let for_sc = [created_at, 22, user_fid, data.hash, mentionedFid, user_followers]
                let for_sc = {
                    data: [mentionedFid],
                    created_at,
                    code: 22,
                    user_fid,
                    user_followers,
                    cast_hash: data.hash, 
                    replyTo_cast_hash:  "0x0000000000000000000000000000000000000000" ,
                    embeded_string: "",
                    nonce: 0,
                    processed: 0
                };

                
                featuresArray.push(features);
                for_scArray.push(for_sc);

        } else {
          console.log(`user_fid: ${user_fid} is not a registered infuencer for campaign fid: ${mentionedFid} `);
        }

    } else {
      console.log(`The mentionedFid "${mentionedFid}" is not in the campaign_fids.`);
    }

  }
  // const cast_mentioned_profiles = data.mentioned_profiles; 
  //#region
  // [
  //   {
  //     object: 'user',
  //     fid: 620429,   ///Company account fid
  //     custody_address: '0x0641d24cddacd194567ba37d9e7eb531d6bd2937',
  //     username: 'swkrates',
  //     display_name: 'Swkrates',
  //     pfp_url: 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/37b7e431-29d4-4a7c-404b-34f162036e00/rectcrop3',
  //     profile: { bio: [Object] },
  //     follower_count: 3,
  //     following_count: 73,
  //     verifications: [ '0x598487b88223169046e43bc4359fcc6d92467911' ],
  //     verified_addresses: { eth_addresses: [Array], sol_addresses: [] },
  //     active_status: 'inactive',
  //     power_badge: false
  //   }
  // ]
  //#endregion
  
  //#region
  // const user_fid  = data.author.fid; //'679934'   //user fid tha casted
  // const user_username  = data.author.username; //'Artemis'
  // const cast_text  = data.text; //'@swkrates is wise at 22:39'
  // const cast_author_fid  = data.author.fid; //'679934'   //user fid tha casted
  // const cast_author_display_name  = data.author.display_name; //'Artemis'
  // const cast_author_username  = data.author.username; //'artemishunter'
  // const cast_thread_hash  = data.thread_hash; //'0x40fc98edca8f50b1b565978a44aeb05a318a09a5'
  // const cast_parent_url  = data.parent_url; //'null'
  // const cast_root_parent_url  = data.root_parent_url; //'null'
  // const cast_timestamp  = data.timestamp; //'2024-06-17T20:40:24.000Z'
  // const cast_reactions_likes_count  = data.reactions.likes_count; //'0'
  // const cast_reactions_recasts_count  = data.reactions.recasts_count; //'0'
  // const cast_reactions_likes  = data.reactions.likes; //'[]'
  // const cast_reactions_recasts  = data.reactions.recasts; //'[]'
  // const cast_replies_count  = data.replies.count; //'0'
  // const cast_author_object  = data.author.object; //'user'
  // const cast_author_custody_address  = data.author.custody_address; //'0x273b1af3909644f12bf9f2a85068fb33d457f1c8'
  // const cast_author_pfp_url  = data.author.pfp_url; //'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/86ef3f85-c1a0-43f0-6bb3-1999f655c600/rectcrop3'
  // const cast_author_follower_count  = data.author.follower_count; //'0'
  // const cast_author_following_count  = data.author.following_count; //'61'
  // const cast_author_verifications  = data.author.verifications; //'[]'
  // const cast_author_verified_addresses  = data.author.verified_addresses; //'{ eth_addresses: [], sol_addresses: [] }'
  // const cast_author_active_status  = data.author.active_status; //'inactive'
  // const cast_author_power_badge  = data.author.power_badge; //'false'
  // const cast_author_profile  = data.author.profile; //'{ bio: { text: '' } }'
  //#endregion



  // *** CASE 4 Tagline included in cast_text ***
  // EXAMPLE
  // let taglinesArray = ["Yolo Dream Cars3", "Yolo Dream Cars1", "Yolo Dream Cars5"];
  // let cast_text = "This is very true at 09:33 Yolo Dream Cars3";
  if (taglinesArray.length > 0)
  {
      // Find the index of the element in taglinesArray that is included in the cast_text
      let foundIndex = taglinesArray.findIndex(tagline => cast_text.includes(tagline));

      if (foundIndex !== -1) {
          console.log(`The element "${taglinesArray[foundIndex]}" appears in the cast_text at position ${foundIndex} in taglinesArray.`);
          //enforce infuencer to only include 1 tagline in the cast, the campaign tagline, any other taglines will be ignored
          const tagline = taglinesArray[foundIndex];

          let features = {
            created_at,
            humantime:  data.timestamp,
            action: "cast",  
            action_type: "tagline",  // 23
            user_fid: data.author.fid,
            user_username: data.author.username,
            user_followers,
            cast_hash: data.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
            cast_text,
            tagline,
          };


          // let for_sc = [created_at, 23, data.author.fid, data.hash, tagline, user_followers ]
          let for_sc = {
              data: [],
              created_at,
              code: 23,
              user_fid: data.author.fid,
              user_followers,
              cast_hash: data.hash, 
              replyTo_cast_hash:  "0x0000000000000000000000000000000000000000" ,
              embeded_string: tagline,
              nonce: 0,
              processed: 0
          };
          
          featuresArray.push(features);
          for_scArray.push(for_sc);
      } else {
          console.log("No element from taglinesArray appears in the cast_text.");
      }

  }


      
  console.log(`***** featuresArray: `,featuresArray);
  console.log(`***** for smart contracts for_scArray:`,for_scArray)
  return {features: featuresArray, for_sc: for_scArray};


  // NOTES
  // A> if company account fid is in the mentioned_profiles then credit the user | Number Followers
  // B> NEXT VERSION Keep hold of the cast_hash and cast_author_fid for future reference | if someone reacts to the cast then points should be allocated to the user that casted the cast
  // C> if the parent_hash is not null and it is a copmany cast hash (STORE ALL COMPNAY CAST HASHES) and parent_author fid is the company account then
  // 1. credit the user    2. NEXT VERSION keep analytics about the most succesful casts

}
//#endregion





//#region REST API

// UNITS 3 or x3 of Array length
const getUserInfo_withFids_Bulk = async (fidsARARY=[620429,3,5]) => {
  const user_url = `${base}v2/farcaster/user/bulk?fids=${fidsARARY.join('%2C')}`;
  //Example: 'https://api.neynar.com/v2/farcaster/user/bulk?fids=620429%2C3%2C5'

  const user_response = await fetch(user_url, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'gzip, deflate, br',
      'api_key': apiKey,
    },
  });

  const response = await user_response.json();
  console.log(response)

  const firstUser = response.users[0];
  const firstUser_numberOfFollowers = (firstUser.follower_count && firstUser.follower_count > 0) ? firstUser.follower_count : 1;
  console.log(`Number Of Followers for Fid: ${fidsARARY[0]} : `,firstUser_numberOfFollowers);
  return firstUser_numberOfFollowers;

  //#region
  // {
  //   users: [
  //     {
  //       object: 'user',
  //       fid: 620429,
  //       custody_address: '0x0641d24cddacd194567ba37d9e7eb531d6bd2937',
  //       username: 'swkrates',
  //       display_name: 'Swkrates',
  //       pfp_url: 'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/37b7e431-29d4-4a7c-404b-34f162036e00/rectcrop3',
  //       profile: [Object],
  //       follower_count: 5,
  //       following_count: 74,
  //       verifications: [Array],
  //       verified_addresses: [Object],
  //       active_status: 'inactive',
  //       power_badge: false
  //     }
  //   ]
  // }
  //#endregion
}
// getUserInfo_withFids_Bulk([620429]);

//#endregion REST API


//NOTE: AT THE MOMENT NEYNAR WEBHOOKS DO NOT SUPPORT cast.deleted

//#endregion








// Setup Smart Contracts - Establish connection to all smart contracts in both Base and Base Sepolia
// Depending on the webhook secret we will determine at verifyWebhookSignature whether to use smart contract on Base or Base Sepolia per request
setupContracts();   

//#region Smart Contracts Functions




// DELETE FROM HERE
// const getPendingCampaigns = async () => {
// 	const pendingCampaignUIDs =  await CampaignManager_admin.get_pendingCampaignUIDs();
//   const pendingCampaignUIDs_Numbers = pendingCampaignUIDs.map(uid => `${uid}`);
// 	// console.log(`pendingCampaignUIDs_Numbers: `,pendingCampaignUIDs_Numbers);
// 	return pendingCampaignUIDs_Numbers;
// }

// const getActiveCampaignUIDs = async () => {
// 	const activeCampaignUIDs =  await CampaignManager_admin.get_activeCampaignUIDs();
//   const activeCampaignUIDs_Numbers = activeCampaignUIDs.map(uid => `${uid}`);
// 	// console.log(`activeCampaignUIDs_Numbers: `,activeCampaignUIDs_Numbers);
// 	return activeCampaignUIDs_Numbers;
// }
// const get_Campaign_Specs = async (campaign_uuid) => {
// 	const campaigneSpecs =  await CampaignManager_admin.getCampaign(campaign_uuid);
// 	console.log(`campaigneSpecs: `,campaigneSpecs);
// 	return campaigneSpecs;
// }
// DELETE TO HERE






//#region CampaignManager
const getCampaign_Infuencers_From_Fid = async (campaign_fid) => {
  const campaign_registered_infuencers_fids =  await CampaignManager_admin.getCampaign_Infuencers_FromFid(campaign_fid);
  const campaign_registered_infuencers_readable = campaign_registered_infuencers_fids.map(fid => `${fid}`);
  console.log(`campaign_registered_infuencers_readable: `,campaign_registered_infuencers_readable);
  return campaign_registered_infuencers_readable;
}
//#endregion CampaignManager




//#region CampaignAssets
const get_embeds = async () => {
	const embeds =  await CampaignAssets_admin.get_embeds();
	console.log(`get_embeds embeds: `,embeds);
	return embeds;
}

const get_tagLines = async () => {
	const tagLines =  await CampaignAssets_admin.get_tagLines();
	console.log(`get_tagLines tagLines : `,tagLines );
	return tagLines ;
}


const getActiveCampaignFIDs = async () => {
	const activeCampaignFIDs =  await CampaignAssets_admin.get_activeCampaignFIDs();
  const activeCampaignFIDs_readable = activeCampaignFIDs.map(fid => `${fid}`);
	console.log(`activeCampaignFIDs_readable: `,activeCampaignFIDs_readable);
	return activeCampaignFIDs_readable;
}

// const getCampaign_UUID_FID_forEmbed = async (embed_string) => {
// 	const {campaign_uuid , campaign_fid} =  await CampaignAssets_admin.campaignEmbed_string(embed_string);
// 	console.log(`getCampaign_UUID_FID_forEmbed campaign_uuid: ${campaign_uuid} campaign_fid: ${campaign_fid}`);
// 	return `${campaign_fid}`;
// }

// const getCampaign_UUID_FID_forTagline = async (embed_string) => {
// 	const {campaign_uuid , campaign_fid} =  await CampaignAssets_admin.campaignTagLine_string(embed_string);
// 	console.log(`getCampaign_UUID_FID_forTagline campaign_uuid: ${campaign_uuid} campaign_fid: ${campaign_fid}`);
// 	return `${campaign_fid}`;
// }

//#endregion CampaignAssets


//#region SquawkProcessor
// ArrayOfFreshSquawks is  [ Squawk, Squawk, Squawk ]   where Squawk is a struct / object
const recordData_on_SquawkProcessor = async (ArrayOfFreshSquawks) => {
	return new Promise (async (resolve,reject) => {
		console.log(`recordData_on_SquawkProcessor ArrayOfFreshSquawks: `,ArrayOfFreshSquawks);
		try {
			const tx=  await SquawkProcessor_admin.addSquawkData(ArrayOfFreshSquawks);
			const receipt = await tx.wait();
			if (receipt.status === false) {
				throw new Error(`Transaction recordData_on_SquawkProcessor failed`);
			}
			resolve({msg:`Transaction recordData_on_SquawkProcessor succeeded`, receipt, tx,});

		}
		catch (e) {
			console.log(` ********** while recordData_on_SquawkProcessor an error occured ********** Error: `,e);
			resolve(e);
		}
	});

}


const getSquawkBoxElementRange = async () => {
	const SquawkBoxLength =  await SquawkProcessor_admin.getSquawkBoxLength();

	const SquawkBox_Data_raw =  await SquawkProcessor_admin.getSquawkBoxElementRange(0,SquawkBoxLength-1);

  const SquawkBox_Data = SquawkBox_Data_raw.map(squawk => {
    return {
            data: `${squawk.data[0]}`,
            created_at: `${squawk.created_at}`,
            code: `${squawk.code}`,
            user_fid: `${squawk.user_fid}`,
            user_followers: `${squawk.user_followers}`,
            cast_hash: squawk.cast_hash,
            replyTo_cast_hash: squawk.replyTo_cast_hash,
            embeded_string: squawk.embeded_string,
            nonce: `${squawk.nonce}`,
            processed: `${squawk.processed}`,
          
          }
        });

  for (let i=0; i<SquawkBox_Data.length; i++) {
    console.log(`SquawkBox_Data[${i}]: `,JSON.stringify(SquawkBox_Data[i]));
  }
  

	console.log(`getSquawkBoxElementRange is run`);
	return SquawkBox_Data;
}
//#endregion SquawkProcessor


//#endregion Smart Contracts Functions







server.listen(port, () => {
  console.log(`Webhook Server is up on port ${port}`);
});