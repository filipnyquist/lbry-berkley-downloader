const logger = require('winston');
const fs = require('fs');
const LbryTrnsf = require('./lib/LbryTrnsf');

var Config = require('./lib/config');


/*---LOGGING---*/
var now = new Date();
var t = now.toISOString().replace(/[:.]/gi, '-');
var fname = './log/' + t + '.log';
try {
    fs.mkdirSync('./log');
} catch (e) {}


logger.level = 'debug';

logger.remove(
    logger.transports.Console
).add(logger.transports.Console, {
    colorize: true,
    handleExceptions: true,
    humanReadableUnhandledException: true
}).add(logger.transports.File, {
    level: 'debug',
    filename: fname,
    handleExceptions: true
}).handleExceptions(new logger.transports.File({
    filename: './crash.log'
}));

var config = Config();

var lbryTrnsf = new LbryTrnsf(config);