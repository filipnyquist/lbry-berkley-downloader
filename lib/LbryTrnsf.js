'use strict';
const logger = require('winston');
const ytdl = require('youtube-dl');
const google = require('googleapis');
const youtube = google.youtube('v3');
const sqlite3 = require('sqlite3');
const Bottleneck = require("bottleneck");
const db = new sqlite3.Database('db.sqlite');
const request = require('request');
const path = require('path');
const fs = require('fs');
const stream = require('stream');
const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-2'
});
const s3 = new AWS.S3();
let connection;
let API_KEY;
let limiter;
//Custom status stuff
const express = require('express');
const app = express()
const port1 = 3001
  //
class LbryTrnsf {
  constructor(config, argv) {
    logger.info('[LbryTrnsf] : Initializing Modules, booting the spaceship...');
    db.run("CREATE TABLE IF NOT EXISTS videos (videoid TEXT UNIQUE, downloaded INT, uploaded INT, channelid TEXT, fulltitle TEXT, description TEXT, thumbnail BLOB, data BLOB)");
    this.config = config;
    this.argv = argv;
    this.init(config, argv);
  }

  init(config,argv) {
    API_KEY = config.get('youtube_api').key;
    limiter = new Bottleneck(config.get('limiter').concurrent_d, 1000);
    startstatus();
    logger.info('[LbryTrnsf] : Program is initialized!');
    if (!argv.channelid) {
      logger.info('[LbryTrnsf] : Please specify a channel with --channelid <chid>!');
      process.exit(0);
    } else {
      resolveChannelPlaylist(argv.channelid);
    }
  }

}
//berkley stuff, serves stats for now
function startstatus() {
  app.get('/', (request, response) => {
    db.get("SELECT count(downloaded) FROM videos;", function (err, amnt) {
      db.get("SELECT count(downloaded) FROM videos WHERE downloaded=1;", function (err, amtdn) {
        response.send("LBRY Download Tool Status: Downloaded " + amtdn[Object.keys(amtdn)[0]] + " out of " + amnt[Object.keys(amnt)[0]] + " videos!");
      })
    })
  });

  app.listen(port1, (err) => {
    if (err) {
      return console.log('something bad happened', err)
    }

    console.log(`server is listening on ${port1}`)
  })
};
//Functions here...
function resolveChannelPlaylist(chid) { //Function to get the playlist with all videos from the selected channel(by id)
  logger.info('[LbryTrnsf] : Getting list of videos for channel %s', chid);
  request('https://www.googleapis.com/youtube/v3/channels?part=contentDetails,brandingSettings&id=' + chid + '&key=AIzaSyBActRVXBfP6RUVwWkMpcUH5uX-aantbL0', function (error, response, body) {
    if (error) {
      logger.debug('[LbryTrnsf][ERROR] :', error);
    } // Print the error if one occurred
    if (typeof JSON.parse(body).items[0].contentDetails.relatedPlaylists.uploads !== "undefined") {
      let pl = JSON.parse(body).items[0].contentDetails.relatedPlaylists.uploads;
      logger.info('[LbryTrnsf] : Got the playlist for the channel %s: %s , saving down metadata for the videos....', chid, pl);
      getChannelVids(chid, JSON.parse(body).items[0].contentDetails.relatedPlaylists.uploads, false, ''); //Calls the getChannelVids function and keeps going....
    }
  });

}

function getChannelVids(chid, playlistid, newpg, pgtoken) { //Gets all the videos metadata and inserts them into the db...

  if (!newpg) { //If its a addon request for items or not
    youtube.playlistItems.list({
        auth: API_KEY,
        part: 'snippet',
        playlistId: playlistid,
        maxResults: 50
      },
      function (err, response) {
        var responsed = response.items;
        db.serialize(function () {
          var stmt = db.prepare("INSERT OR IGNORE INTO videos VALUES (?,?,?,?,?,?,?,?); ");
          responsed.forEach(function (entry, i) {
            stmt.run(entry.snippet.resourceId.videoId, 0, 0, chid, entry.snippet.title, entry.snippet.description, JSON.stringify(entry.snippet.thumbnails.standard), JSON.stringify(entry.snippet));
          });
          stmt.finalize();

        })
        logger.info('[LbryTrnsf] : Saved down %s videos owned by channel %s', responsed.length, chid);
        if (typeof response.nextPageToken !== 'undefined') {
          logger.info('[LbryTrnsf] : More videos, going to next page...');
          getChannelVids(chid, playlistid, true, response.nextPageToken);
        } else {
          //NO MORE VIDEOS TO SAVE, CALL DOWNLOAD FUNCTION HERE
          logger.info('[LbryTrnsf] : Done saving to db...');
          downChannelVids(chid);
        }
      }
    );
  }
  if (newpg) { //Fetch the next page and save it aswell
    youtube.playlistItems.list({
        auth: API_KEY,
        part: 'snippet',
        playlistId: playlistid,
        maxResults: 50,
        pageToken: pgtoken
      },
      function (err, response) {
        var responsed = response.items;
        db.serialize(function () {
          var stmt = db.prepare("INSERT OR IGNORE INTO videos VALUES (?,?,?,?,?,?,?,?); ");
          responsed.forEach(function (entry, i) {
            stmt.run(entry.snippet.resourceId.videoId, 0, 0, chid, entry.snippet.title, entry.snippet.description, JSON.stringify(entry.snippet.thumbnails.standard), JSON.stringify(entry.snippet));
          });
          stmt.finalize();

        })
        logger.info('[LbryTrnsf] : Saved down %s videos owned by channel %s', responsed.length, chid);
        if (typeof response.nextPageToken !== 'undefined') {
          logger.info('[LbryTrnsf] : More videos, going to next page...');
          getChannelVids(chid, playlistid, true, response.nextPageToken);
        } else {
          logger.info('[LbryTrnsf] : Done saving to db...');
          downChannelVids(chid);
        }
      }
    );
  }
}

function downChannelVids(chid) { //Downloads all the videos from the playlist and saves them to the db and on disk for lbry upload.

  db.each("SELECT videoid,channelid,fulltitle,description FROM videos WHERE downloaded = 0 AND channelid = '" + chid + "'", function (err, row) {
    limiter.submit(dlvid, chid, row, null);
  });
  limiter.on('idle', function () {
    logger.info('Downloaded all the videos for the channel!');
  });
}

function dlvid(chid, row, cb) {

  savethumb(row.videoid); //Call function to download thumbnail into bucket!

  var downloaded = 0;

  var video = ytdl('https://www.youtube.com/watch?v=' + row.videoid,

    // Optional arguments passed to youtube-dl.
    ['--format=best'],
    // start will be sent as a range header
    {
      cwd: __dirname,
      maxBuffer: 1000000 * 1024
    });

  // Will be called when the download starts.
  video.on('info', function (info) {
    logger.info('[LbryTrnsf] : Download started for video %s', row.videoid);
  });

  //Upload to S3
  video.pipe(uploadFromStream(s3, row));

  // Will be called if download was already completed and there is nothing more to download.
  video.on('complete', function complete(info) {
    'use strict';
    logger.info('[LbryTrnsf] : Download finished for video %s', row.videoid);
    cb();
    //db edit downloaded to 1
    db.run("UPDATE videos SET downloaded=1 WHERE videoid='" + row.videoid + "'");
  });

  video.on('end', function () {
    logger.info('[LbryTrnsf] : Download finished for video %s', row.videoid);
    cb();
    //db edit downloaded to 1
    db.run("UPDATE videos SET downloaded=1 WHERE videoid='" + row.videoid + "'");
  });
}

function uploadFromStream(s3, row) {
  var pass = new stream.PassThrough();
  var bucket_name = 'lbry-niko2'
  var params = {
    Bucket: bucket_name,
    Key: 'videos/' + row.channelid + '/' + row.videoid + '.mp4',
    Body: pass
  };
  s3.upload(params, function (err, data) {
    console.log(err, data);
  });

  return pass;
}

function savethumb(v_id) {
  request.put({
    url: 'https://jgp4g1qoud.execute-api.us-east-1.amazonaws.com/prod/thumbnail',
    method: 'PUT',
    json: {
      videoid: v_id
    }
  }, function (error, response, body) {
    if (error) {
      console.log(error);
    } else {
      db.run("UPDATE videos SET thumbnail='" + body.url + "' WHERE videoid='" + v_id + "'");
    }
  });
}

module.exports = LbryTrnsf;