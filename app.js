let fs = require('fs'),
    parseString = require("xml2js").parseString,
    xml2js = require("xml2js");

function init() {
    // initialize edited directory if it does not exist
    ensureExists(__dirname + '/output', 0744, function(err) {
        if (err) console.log('Error: ' + err);// handle folder creation error
        // else // we're all good
    });

    // get all files to convert from input directory
    fs.readdir(__dirname + '/input', function(err, files) {
        if (err) return console.log('Unable to scan input dir\n' + err);

        for (let file of files) {
            readFileAndEdit(file);
        }
    });
}

function ensureExists(path, mask, cb) {
    if (typeof mask == 'function') { // allow the `mask` parameter to be optional
        cb = mask;
        mask = 0777;
    }
    fs.mkdir(path, mask, function(err) {
        if (err) {
            if (err.code == 'EEXIST') cb(null); // ignore the error if the folder already exists
            else cb(err); // something else went wrong
        } else cb(null); // successfully created folder
    });
}

function readFileAndEdit(filename) {
    fs.readFile(__dirname + '/input/' + filename, 'utf-8', function(err, data) {
        if (err) return console.log('Unable to read file: ' + filename + '\n' + err);

        parseString(data, function(err, result) {
            if (err) return console.log('Unable to parse xml: ' + filename + '\n' + err);

            let svgObject = result;

            editPageSVG(svgObject);

            let builder = new xml2js.Builder();
            let xml = builder.buildObject(svgObject);

            let editedFilename = filename.substring(0, filename.length - 4) + '_edited.svg';

            fs.writeFile(__dirname + '/output/' + editedFilename, xml, function(err, data) {
                if (err) return console.log('Unable to write file: ' + editedFilename + '\n' + err);
        
                console.log("Successfully generated: " + editedFilename);
            });
        });
    });
}

function editPageSVG(svgJSON) {
    // remove unneeded inkscape attributes
    deleteInkscapeAttr(svgJSON.svg);
    delete svgJSON.svg['sodipodi:namedview'];
    deleteInkscapeAttr(svgJSON.svg.g[0]);

    // Initialize Group Elements
    let cutGroup = {'$': {
                            "id": "cut",
                            "style": "stroke:#000000;stroke-width:0.5;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1"
                        }, 
                        'path': []
                    };
    let scoreGroup = {'$': {
                            "id": "score",
                            "style": "stroke:#00ff00;stroke-width:0.5;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1"
                        }, 
                        'path': []
                    };
    let mountainGroup = {'$': {
                            "id": "mountain",
                            "style": "stroke:#0000ff;stroke-width:0.5;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1"
                        }, 
                        'path': []
                    };
    let valleyGroup = {'$': {
                            "id": "valley",
                            "style": "stroke:#ff0000;stroke-width:0.5;stroke-linecap:butt;stroke-linejoin:miter;stroke-opacity:1"
                        }, 
                        'path': []
                    };

    // Loop through path objects and separate out into groups
    for (let path of svgJSON.svg.g[0].path) {
        delete path.$.id;
        delete path.$.style;

        // if the stroke-dasharray is present we know it is a score path
        if (path.$['stroke-dasharray']) {
            // a simple dashed line means this is a mountain fold
            if (path.$['stroke-dasharray'] === "1, 1, 0") {
                mountainGroup.path.push(path);
            // if not a mountain fold, then it is a valley fold
            } else {
                valleyGroup.path.push(path);
            }

            // for both mountain and valley, we want to add to the score group
            scoreGroup.path.push(path);
            delete path.$['stroke-dasharray'];
        // if stroke-dasharray is not present, then this is a solid cut line
        } else {
            cutGroup.path.push(path);
        }
    }

    // Add groups to main group
    svgJSON.svg.g[0].g = [];
    svgJSON.svg.g[0].g.push(cutGroup);
    svgJSON.svg.g[0].g.push(scoreGroup);
    svgJSON.svg.g[0].g.push(mountainGroup);
    svgJSON.svg.g[0].g.push(valleyGroup);

    // remove the old paths now that they have all been added to groups
    delete svgJSON.svg.g[0].path;
}

function deleteInkscapeAttr(object) {
    for (let key in object.$) {
        if (Object.prototype.hasOwnProperty.call(object.$, key)) {
            if (key.startsWith('inkscape') || key.startsWith('sodipodi') || key.endsWith('inkscape') || key.endsWith('sodipodi')) {
                delete object.$[key];
            }
        }
    }
}

init();