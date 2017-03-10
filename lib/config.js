const convict = require('convict');
const path = require('path');

module.exports = function() {
    var config = convict({
        youtube_api: {
            key: {
                doc: 'Youtube API key for grabbing video data',
                format: String,
                default: 'NOAPIKEY'
            }
        },
        limiter: {
            concurrent_d: {
                doc: 'Amount of concurrent downloads(from youtube)',
                format: Number,
                default: 'NOAPIKEY'
            },
            concurrent_u: {
                doc: 'Amount of concurrent uploads(to lbry)',
                format: Number,
                default: 'NOAPIKEY'
            }
        }
    });

    // Load configuration
    config.loadFile(path.resolve(__dirname, 'config.json'));

    // Perform validation
    config.validate();

    return config;
}