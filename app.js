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
server.listen(process.env.port || process.env.PORT || 3978, () => {
   console.log('%s listening to %s', server.name, server.url); 
});
  
// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata 
});

// setInterval(() => {
//     connector.getAccessToken((error) => {
//         console.log(JSON.stringify(error));
//     }, (token) => {
//         console.log('token refreshed: ${token}');
//     });
// }, 30*60*1000);

// Listen for messages from users 
server.post('/api/messages', connector.listen());

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var luisAPIHostName = process.env.LuisAPIHostName || 'westus.api.cognitive.microsoft.com';
var getUrl = 'http://52.226.128.177:5000/magic';
const LuisModelUrl = 'https://' + luisAPIHostName + '/luis/v1/application?id=' + luisAppId + '&subscription-key=' + luisAPIKey;

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
var intents = new builder.IntentDialog({ recognizers: [recognizer] });

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = 'botdata';
var azureTableClient = new botbuilder_azure.AzureTableClient(tableName, process.env['AzureWebJobsStorage']);
var tableStorage = new botbuilder_azure.AzureBotStorage({ gzipData: false }, azureTableClient);

// var inMemoryStorage = new builder.MemoryBotStorage();

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector, (session) => {
    session.sendTyping();
    if(session.userData.username) {
        session.beginDialog('/oldUser');
    } else {
        session.beginDialog('/newUser')
    }
}).set('storage', tableStorage);

bot.dialog('/newUser', [
    (session) => {
        session.sendTyping();
        builder.Prompts.text(session, 'Hello. What should I call you?');
    },
    (session, results) => {
        session.sendTyping();
        session.userData.username = results.response;
        session.save();
        session.send('Hi %s. This is Creative Augmented Multimedia. I would like to show you something cool.', session.userData.username);
        builder.Prompts.text(session, 'Type something.');
    },
    (session, results) => {
        session.sendTyping();
        session.beginDialog('/main', results);
    }
]);

bot.dialog('/oldUser', [
    (session) => {
        session.sendTyping();
        session.send('Hi %s. Welcome back!', session.userData.username);
        builder.Prompts.text(session, 'Get started');
    },
    (session, results) => {
        session.sendTyping();
        session.beginDialog('/main', results);
    }
]);

bot.dialog('/main', [
    (session, results, next) => {
        if(session.message.text == 'continue') {
            builder.Prompts.text(session, 'Type something');
        } else if(session.message.text == 'finish') {
            session.endConversation('Goodbye');
        } else {
            next(results);
        }
    },
    (session,results, next) => {
        session.sendTyping();
        results.response = results.response.replace("&apos;", "");
        results.response = results.response.replace("&quot;", "");
        results.response = results.response.replace(/[^0-9a-zA-Z\s]+/g,"");
        var req = http.get(getUrl+"?str="+results.response, (response) => {
            var body = "";
            //Read the data
            response.on('data', (chunk) => {
                body += chunk;
            });
            response.on('end', () => {
                if(response.statusCode == 200) {
                        var e = JSON.parse(body); 
                        console.dir(e);
                var msg = new builder.Message(session).addAttachment(    
                new builder.VideoCard(session)
                    .title('CAM')
                    .subtitle('by cam.ai.FortyTwo')
                    .text('')
                    .image(builder.CardImage.create(session, ''))
                    .media([
                        { url: e.url }
                    ]));
                    session.send(msg);
                } else {
                    session.send("Error occurred. Please try again.");
                }
                next();
            });            
        })
    },
    (session) => {
        var msg = new builder.Message(session)
        .text('What would you like to do now?')
        .suggestedActions(
            builder.SuggestedActions.create(
                session, [
                    builder.CardAction.postBack(session, "continue", "Give it another go"),
                    builder.CardAction.postBack(session, "finish", "That's all for now")
                ]
        ));
        session.send(msg);
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
        connector.getAccessToken((error, token) => {
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
        var wordCount = text.split(' ').filter((x) => { return x; }).length;
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
    message.attachments.forEach((attachment) => {
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
            (cb) => {
                if (containsSkypeUrl) {
                    connector.getAccessToken(cb);
                }
                else {
                    cb(null, null);
                }
            }
        ], (err, token) => {
            if (!err) {
                var buffers = [];
                async.forEachOf(attachments, (item, idx, cb) => {
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
                    }, (err, res, body) => {
                        if (!err && res.statusCode == 200) {
                            buffers.push(body);
                        }
                        cb(err);
                    });
                }, (err) => {
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