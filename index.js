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
  console.log(` *******> body: `,body);

  // const timestamp = moment().format('YYYY-MM-DD HH:mm:ss'); // Format timestamp

  const run_verifications = async (body,req) => {
      let _postActions = [];

      const sig = req.get("X-Neynar-Signature");
      if (sig)
      {
        console.log(`Received Webhook Signature: ${sig}`); 
        _postActions = await verifyWebhookSignature(body,sig);
        console.log(`_postActions 1: `,_postActions);
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
const verifyWebhookSignature = async (body,sig, post) => {
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


  const postActions = await analyseWebhookData(body, post);
  // console.log(`postActions 2: `,postActions);

  return postActions;
};
//#endregion

const analyseWebhookData = async (body, post) => {
  let postActions = [];
  let for_smartcontract = [];


  //TODO get campaign fids from sc 

  //TODO if for all cases I can get the infuencers fid for the specific campaign FID then I can credit the influencer with points

 

  console.log(`Analysing POST body data`);  

  if (body.type === "cast.created") {
    const { features, for_sc } = handle_CastCreated(body.data, body.created_at, post);
    postActions.push(features);
    for_smartcontract.push(for_sc);
  }
  else if (body.type === "follow.created") {
    const { features, for_sc } = await handle_Follow(body.data, body.created_at);
    postActions.push(features);
    for_smartcontract.push(for_sc);
  }
  else if (body.type === "follow.deleted") {
    const { features, for_sc } = await handle_Unfollow(body.data, body.created_at);
    postActions.push(features);
    for_smartcontract.push(for_sc);
  }
  else if (body.type === "reaction.created") {
    const { features, for_sc } = await handle_Reaction_Created(body.data, body.created_at);
    postActions.push(features);
    for_smartcontract.push(for_sc);
  }
  else if (body.type === "reaction.deleted") {
    const { features, for_sc } = await handle_Reaction_Deleted(body.data, body.created_at);
    postActions.push(features);
    for_smartcontract.push(for_sc);
  }
  else {
    console.log(`*** Unknown webhook type ***: ${body.type}`);
  }


  console.log(`3 postActions: `,postActions);
  console.log(`for_smartcontract: `,for_smartcontract);
  return postActions;
};





//#region Case 1: A user follows company account
const handle_Follow = async (data, created_at) => {
  console.log(`handle_Follow: New Follow created_at: ${created_at}`);
  // const msg_object  = data.object; //'follow'    //sc //TODO categorise body.type in  => 7 categories
  // const msg_timestamp = data.timestamp; //'2024-06-17T19:46:17.000Z'
  // console.log(`handle_Follow: New Follow data.timestamp: ${data.timestamp}`);
  // const user_object  = data.user.object; //'user_dehydrated'
  // const user_fid  = data.user.fid; //'679934'
  // const user_username  = data.user.username; //'artemishunter'
  // const user_follows_account_object  = data.target_user.object; //'user_dehydrated'
  // const user_follows_account_fid  = data.target_user.fid; //'620429'
  // const user_follows_account_username  = data.target_user.username; //'swkrates'
  
  let features = {
    created_at,
    humantime:  data.timestamp,
    action: "follow", //14
    user_fid: data.user.fid,
    user_username: data.user.username,
    user_followed: data.target_user.fid,
    user_name_followed: data.target_user.username
  };

  let for_sc = [created_at, 14, data.user.fid, data.target_user.fid]
  // console.log(`***** features: `,features);
  // console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};
}
//#endregion

//#region Case 2: A user unfollows company account
const handle_Unfollow = async (data, created_at) => {
  console.log(`handle_Unfollow: New Unfollow created_at: ${created_at}`);
  // const msg_object  = data.object; //'unfollow'
  // const msg_timestamp = data.timestamp; //'2024-06-17T19:38:14.000Z'
  // const user_object  = data.user.object; //'user_dehydrated'
  // const user_fid  = data.user.fid; //'679934'
  // const user_username  = data.user.username; //'artemishunter'
  // const user_unfollows_account_object  = data.target_user.object; //'user_dehydrated'
  // const user_unfollows_account_fid  = data.target_user.fid; //'620429'
  // const user_unfollows_account_username  = data.target_user.username; //'swkrates'

  let features = {
    created_at,
    humantime:  data.timestamp,
    action: "unfollow", //15
    user_fid: data.user.fid,
    user_username: data.user.username,
    user_unfollowed: data.target_user.fid,
    user_name_unfollowed:  data.target_user.username
  };

  let for_sc = [created_at, 15, data.user.fid, data.target_user.fid]
  // console.log(`***** features: `,features);
  // console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};
}
//#endregion




//#region Case 3: A user REACTION of a company CAST
const handle_Reaction_Created = async (data, created_at) => {

  console.log(`handle_Reaction_Created author: `,data.cast.author);
  console.log(`handle_Reaction: New Reaction created_at: ${created_at}`);
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


  //TODO if user with fid in the program like the cast and cast_author_fid is the company account

  //TODO if user with fid recasts and cast_author_fid is the company account


  let features = {
    created_at,
    humantime:  data.timestamp,
    action: "reaction", 
    reaction_type: data.reaction_type === 1 ? "like" : "recast", // 1:'like' 2:'recast' // 16, 17
    user_fid: data.user.fid,
    user_username: data.user.username,
    cast_hash: data.cast.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
    cast_author_fid: data.cast.author.fid, //'620429'
    cast_author_username: data.cast.author.username, //'swkrates'
  };

  let for_sc = [created_at, (data.reaction_type === 1? 16 : 17), data.user.fid, data.cast.hash, data.cast.author.fid]
  console.log(`***** features: `,features);
  console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};
}
//#endregion

//#region Case 4: A user REACTION is DELETED on a company CAST
const handle_Reaction_Deleted = async (data, created_at) => {
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


  //TODO if user with fid in the program deletes-like or a cast and cast_author_fid is the company account

  //TODO How is it captured when he deletes re-cast Is it a simple cast delete?


  let features = {
    created_at,
    humantime:  data.timestamp,
    action: "reaction", 
    reaction_type: data.reaction_type === 1 ? "unlike" : "unknown", // 1:'unlike'  // 18
    user_fid: data.user.fid,
    user_username: data.user.username,
    cast_hash: data.cast.hash, //'0xe556bc94a69df048385d4be2f304e10c9bb0e78f'
    cast_author_fid: data.cast.author.fid, //'620429'
    cast_author_username: data.cast.author.username, //'swkrates'
  };

  let for_sc = [created_at, 18, data.user.fid, data.cast.hash, data.cast.author.fid]
  console.log(`***** features: `,features);
  console.log(`***** for smart contracts for_sc:`,for_sc)
  return {features, for_sc};

}
//#endregion




//#region
const handle_CastCreated = async (data, created_at) => {
  console.log(`handle_CastCreated: New Cast Created ${created_at}`);

  console.log(`handle_CastCreated author.profile: `,data.author.profile);
  console.log(`handle_CastCreated author.verified_addresses: `,data.author.verified_addresses);
  console.log(`handle_CastCreated data.embeds: `,data.embeds);
  console.log(`handle_CastCreated data.author.verifications: `,data.author.verifications);
  console.log(`handle_CastCreated data.reactions.likes: `,data.reactions.likes);
  console.log(`handle_CastCreated data.reactions.recasts: `,data.reactions.recasts);
  console.log(`handle_CastCreated data.mentioned_profiles: `,data.mentioned_profiles);


  const cast_object  = data.object; //'cast'
  const cast_hash  = data.hash; //'0x40fc98edca8f50b1b565978a44aeb05a318a09a5'
  const cast_thread_hash  = data.thread_hash; //'0x40fc98edca8f50b1b565978a44aeb05a318a09a5'
  const cast_parent_hash  = data.parent_hash; //'null' //***  IF IT IS A REPLY THIS IS THE CAST HASH IT REPLIES TO
  const cast_parent_url  = data.parent_url; //'null'
  const cast_root_parent_url  = data.root_parent_url; //'null'
  const cast_parent_author_fid  = data.parent_author.fid; //'null' //***  IF IT IS A REPLY THIS IS THE COMPANY FID THAT CASTED THE CAST IT REPLIES TO
  const cast_text  = data.text; //'@swkrates is wise at 22:39'
  const cast_timestamp  = data.timestamp; //'2024-06-17T20:40:24.000Z'
  const cast_embeds  = data.embeds; //'[]'
  const cast_reactions_likes_count  = data.reactions.likes_count; //'0'
  const cast_reactions_recasts_count  = data.reactions.recasts_count; //'0'
  const cast_reactions_likes  = data.reactions.likes; //'[]'
  const cast_reactions_recasts  = data.reactions.recasts; //'[]'
  const cast_replies_count  = data.replies.count; //'0'
  const cast_author_object  = data.author.object; //'user'
  const cast_author_fid  = data.author.fid; //'679934'   //user fid tha casted
  const cast_author_custody_address  = data.author.custody_address; //'0x273b1af3909644f12bf9f2a85068fb33d457f1c8'
  const cast_author_username  = data.author.username; //'artemishunter'
  const cast_author_display_name  = data.author.display_name; //'Artemis'
  const cast_author_pfp_url  = data.author.pfp_url; //'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/86ef3f85-c1a0-43f0-6bb3-1999f655c600/rectcrop3'
  const cast_author_follower_count  = data.author.follower_count; //'0'
  const cast_author_following_count  = data.author.following_count; //'61'
  const cast_author_verifications  = data.author.verifications; //'[]'
      
      const cast_author_verified_addresses  = data.author.verified_addresses; //'{ eth_addresses: [], sol_addresses: [] }'
  
  const cast_author_active_status  = data.author.active_status; //'inactive'
  const cast_author_power_badge  = data.author.power_badge; //'false'

      const cast_author_profile  = data.author.profile; //'{ bio: { text: '' } }'

      const cast_mentioned_profiles = data.mentioned_profiles; 
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






   // NOTES
  // if company account fid is in the mentioned_profiles then credit the user | Number Followers

  // Keep hold of the cast_hash and cast_author_fid for future reference | if someone reacts to the cast then points should be allocated to the user that casted the cast
  
  // if the parent_hash is not null and it is a cpmany cast hash (STORE ALL COMPNAY CAST HASHES) and parent_author fid is the company account then
  // 1. credit the user    2. keep analytics about the most succesful casts

}
//#endregion



//#endregion


server.listen(port, () => {
  console.log(`Webhook Server is up on port ${port}`);
});