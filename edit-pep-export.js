let fs = require('fs'),
    parseString = require("xml2js").parseString,
    xml2js = require("xml2js"),
    { pathParse, serializePath } = require('svg-path-parse'),
    { svgBase, groupBase } = require('./svg-template.js');

const LETTER_WIDTH_MIN = 185,
    LETTER_WIDTH_MAX = 220,
    LETTER_HEIGHT_MIN = 250,
    LETTER_HEIGHT_MAX = 285;

function init() {
    // initialize edited directory if it does not exist
    ensureExists(__dirname + '/output', '0744', function(err) {
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
        mask = '0777';
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

        let pepSVG = new pepakuraSVG(data, filename);
    });
}

class pepakuraSVG {
    constructor(svgString, filename) {
        this.filename = filename;
        this.pages = [];

        parseString(svgString, (err, result) => {
            if (err) return console.log('Unable to parse xml: ' + filename + '\n' + err);

            this.svgObject = result;

            this.determineDimensions();

            this.parsePaths();

            for (let page of this.pages) {
                page.writeSVG();
            }

            // this.pages[0].writeSVG();

            //console.log(this.pages[0]);
        });
    }

    determineDimensions() {
        let widthStr = this.svgObject.svg.$.width;
        let heightStr = this.svgObject.svg.$.height;

        let width = parseFloat(widthStr.substr(0, widthStr.length - 2));
        let widthMin = width / LETTER_WIDTH_MIN;
        let widthMax = width / LETTER_WIDTH_MAX;

        if (Math.floor(widthMin) === Math.ceil(widthMax)) {
            this.widthCount = Math.floor(widthMin);
        } else {
            return console.log('Unable to determine page width count.');
        }

        this.pageWidth = width / this.widthCount;
        // convert to inches
        // this.pageWidth = this.pageWidth / 24.5;

        let height = parseFloat(heightStr.substr(0, heightStr.length - 2));
        let heightMin = height / LETTER_HEIGHT_MIN;
        let heightMax = height / LETTER_HEIGHT_MAX;

        if (Math.floor(heightMin) === Math.ceil(heightMax)) {
            this.heightCount = Math.floor(heightMin);
        } else {
            return console.log('Unable to determine page height count.');
        }

        this.pageHeight = height / this.heightCount;
        // convert to inches
        // this.pageHeight = this.pageHeight / 24.5;

        console.log(`width: ${this.pageWidth} height: ${this.pageHeight}`);
    }

    parsePaths() {
        for (let path of this.svgObject.svg.g[0].path) {
            // console.log(path.$.d);
            // let parsedPath = pathParse(path.$.d).normalize({round: 6, transform: `scale(${1 / 24.5})`});
            let parsedPath = pathParse(path.$.d).normalize({});
            path.$.d = serializePath(parsedPath);
            // console.log(serializePath(parsedPath));
            const startX = parsedPath.segments[0].args[0];
            const startY = parsedPath.segments[0].args[1];

            const pageX = Math.floor(startX / this.pageWidth);
            const pageY = Math.floor(startY / this.pageHeight);

            const pageIndex = pageX + (pageY * this.widthCount);

            if (!this.pages[pageIndex]) {
                const editedFilename = `${this.filename.substring(0, this.filename.length - 4)}_${pageIndex + 1}.svg`;
                this.pages[pageIndex] = new svgPage(editedFilename, this.pageWidth, this.pageHeight);
            }

            this.pages[pageIndex].addPath(path);
        }
    }
}

class svgPage {
    constructor(filename, width, height) {
        this.filename = filename;
        this.pageWidth = width;
        this.pageHeight = height;

        this.cutGroup = JSON.parse(groupBase);
        this.scoreGroup = JSON.parse(groupBase);
        this.mountainGroup = JSON.parse(groupBase);
        this.valleyGroup = JSON.parse(groupBase);

        this.cutGroup.$.stroke = '#000000';
        this.scoreGroup.$.stroke = '#00ff00';
        this.mountainGroup.$.stroke = '#0000ff';
        this.valleyGroup.$.stroke = '#ff0000';

        this.cutGroup.$.id = 'cut';
        this.scoreGroup.$.id = 'score';
        this.mountainGroup.$.id = 'mountain';
        this.valleyGroup.$.id = 'valley';
    }

    addPath(path) {
        delete path.$.id;
        delete path.$.style;

        // if the stroke-dasharray is present we know it is a score path
        if (path.$['stroke-dasharray']) {
            // a simple dashed line means this is a mountain fold
            if (path.$['stroke-dasharray'] === "1, 1, 0") {
                this.mountainGroup.path.push(path);
            // if not a mountain fold, then it is a valley fold
            } else {
                this.valleyGroup.path.push(path);
            }

            // for both mountain and valley, we want to add to the score group
            this.scoreGroup.path.push(path);
            delete path.$['stroke-dasharray'];
        // if stroke-dasharray is not present, then this is a solid cut line
        } else {
            this.cutGroup.path.push(path);
        }
    }

    generateSVG() {
        this.svgObject = JSON.parse(svgBase);

        this.svgObject.svg.$.width = `${this.pageWidth}mm`;
        this.svgObject.svg.$.height = `${this.pageHeight}mm`;

        this.svgObject.svg.$.viewBox = `0 0 ${this.pageWidth} ${this.pageHeight}`;

        this.svgObject.svg.g[0].g.push(this.cutGroup);
        this.svgObject.svg.g[0].g.push(this.scoreGroup);
        this.svgObject.svg.g[0].g.push(this.mountainGroup);
        this.svgObject.svg.g[0].g.push(this.valleyGroup);
    }

    writeSVG() {
        this.generateSVG();
        let svgFilename = this.filename;

        let builder = new xml2js.Builder();
        let xml = builder.buildObject(this.svgObject);

        fs.writeFile(__dirname + '/output/' + svgFilename, xml, function(err, data) {
            if (err) return console.log('Unable to write file: ' + svgFilename + '\n' + err);
    
            console.log("Successfully generated: " + svgFilename);
        });
    }
}

init();

module.exports = pepakuraSVG;