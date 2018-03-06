/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/

var restify = require('restify');
var builder = require('botbuilder');
var botbuilder_azure = require("botbuilder-azure");
var Client = require('node-rest-client').Client;
var request = require('request');
var url = require('url');
var async = require('async');

var fs = require('fs');
var http = require('http');
// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// Listen for messages from users 
server.post('/api/messages', connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
bot.set('storage', tableStorage);

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';
var getUrl = 'http://52.226.128.177:5000/magic';
const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
bot.dialog('/', [
    function (session) {
        //Trigger /askName dialog
        console.log("here 0");
        session.send('This is Creative Augmented Multimedia');
        session.beginDialog('/askName');
    },
    function (session, results) {
        //Return hello + user's input (name)
                console.log("here 1");
        console.log(results.response);
        session.send('Hello %s!', results.response);
        builder.Prompts.text(session,'I would like to show you something cool,just type something ');
    },
    function(session,results){
                console.log("here 2");
                console.log(results);   
        var req = http.get(getUrl+"?str="+results.response,function(response){
                                var body = "";
                                //Read the data
                                response.on('data', function(chunk) {
                                  body += chunk;
                                });
                                response.on('end',function(){
                                if(response.statusCode == 200){
                                        var e = JSON.parse(body); 
                                        console.dir(e);
                                var msg = new builder.Message(session).addAttachment(    
                                new builder.VideoCard(session)
                                    .title('Smack')
                                    .subtitle('by the Cam.AI Institute')
                                    .text('')
                                    .image(builder.CardImage.create(session, ''))
                                    .media([
                                        { url: e.url }
                                    ])
                                    .buttons([
                                        builder.CardAction.openUrl(session, 'https://peach.blender.org/', 'Learn More')
                                    ]));
                                    session.send(msg);
                                    } else {
                                        console.log("There is  so much shit");
                                    }
                                });
                                });
    }    
]);
bot.dialog('/askName', [
    function (session) {
                console.log("here 3");
        //Prompt for user input
        builder.Prompts.text(session, 'Hi! What is your name?');
    }
]);


//=========================================================
// Utilities
//=========================================================
function hasAudioAttachment(session) {
    return session.message.attachments.length > 0 &&
        (session.message.attachments[0].contentType === 'audio/wav' ||
            session.message.attachments[0].contentType === 'application/octet-stream');
}

function getAudioStreamFromMessage(message) {
    var headers = {};
    var attachment = message.attachments[0];
    if (checkRequiresToken(message)) {
        // The Skype attachment URLs are secured by JwtToken,
        // you should set the JwtToken of your bot as the authorization header for the GET request your bot initiates to fetch the image.
        // https://github.com/Microsoft/BotBuilder/issues/662
        connector.getAccessToken(function (error, token) {
            var tok = token;
            headers['Authorization'] = 'Bearer ' + token;
            headers['Content-Type'] = 'application/octet-stream';

            return needle.get(attachment.contentUrl, { headers: headers });
        });
    }

    headers['Content-Type'] = attachment.contentType;
    console.log('here :'+attachment.contentUrl);
    return needle.get(attachment.contentUrl, { headers: headers });
}

function checkRequiresToken(message) {
    return message.source === 'skype' || message.source === 'msteams';
}

function processText(text) {
    var result = 'You said: ' + text + '.';

    if (text && text.length > 0) {
        var wordCount = text.split(' ').filter(function (x) { return x; }).length;
        result += '\n\nWord Count: ' + wordCount;

        var characterCount = text.replace(/ /g, '').length;
        result += '\n\nCharacter Count: ' + characterCount;

        var spaceCount = text.split(' ').length - 1;
        result += '\n\nSpace Count: ' + spaceCount;

        var m = text.match(/[aeiou]/gi);
        var vowelCount = m === null ? 0 : m.length;
        result += '\n\nVowel Count: ' + vowelCount;
    }

    return result;
}

function downloadAttachments(connector, message, callback) {
    var attachments = [];
    var containsSkypeUrl = false;
    message.attachments.forEach(function (attachment) {
        if (attachment.contentUrl) {
            attachments.push({
                contentType: attachment.contentType,
                contentUrl: attachment.contentUrl
            });
            if (url.parse(attachment.contentUrl).hostname.substr(-"skype.com".length) == "skype.com") {
                containsSkypeUrl = true;
            }
        }
    });
    if (attachments.length > 0) {
        async.waterfall([
            function (cb) {
                if (containsSkypeUrl) {
                    connector.getAccessToken(cb);
                }
                else {
                    cb(null, null);
                }
            }
        ], function (err, token) {
            if (!err) {
                var buffers = [];
                async.forEachOf(attachments, function (item, idx, cb) {
                    var contentUrl = item.contentUrl;
                    var headers = {};
                    if (url.parse(contentUrl).hostname.substr(-"skype.com".length) == "skype.com") {
                        headers['Authorization'] = 'Bearer ' + token;
                        headers['Content-Type'] = 'application/octet-stream';
                    }
                    else {
                        headers['Content-Type'] = item.contentType;
                    }
                    request({
                        url: contentUrl,
                        headers: headers,
                        encoding: null
                    }, function (err, res, body) {
                        if (!err && res.statusCode == 200) {
                            buffers.push(body);
                        }
                        cb(err);
                    });
                }, function (err) {
                    if (callback)
                        callback(err, buffers);
                });
            }
            else {
                if (callback)
                    callback(err, null);
            }
        });
    }
    else {
        if (callback)
            callback(null, null);
    }
}