const stream = require('stream');
var AWS = require('aws-sdk');
AWS.config.update({
    region: 'us-east-2'
});
var s3 = new AWS.S3();
var fs = require('fs');
function uploadFromStream(s3) {
  var pass = new stream.PassThrough();
  var bucket_name = 'lbry-niko2'
  var params = {Bucket: bucket_name, Key: "work/test.txt", Body: pass};
  s3.upload(params, function(err, data) {
    console.log(err, data);
  });

  return pass;
}