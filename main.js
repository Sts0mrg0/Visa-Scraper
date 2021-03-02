//Visa scraper bot
//2021 MIT License
//Telegram @MiniTHC or onefabcom@gmail.com

const cheerio = require('cheerio');
var nosql = require('nosql');
var DBfolder = 'db/';
var dba = nosql.load(DBfolder+'alpha.nosql');
var hash = require('object-hash');
var googlesheets = require('g-sheets-api');
//https://docs.google.com/spreadsheets/d/1nhcEA_Hy7Hv0SFA-QCpJACL6AhPa6xj9Vp3_cUP6qTI/edit#gid=0
const nodeHtmlToImage = require('node-html-to-image');
var diff_match_patch = require('diff-match-patch');
const scraperDelay = 1500;

var scraper = [];

//async - await
async function loadPage(url) {
  var buf = await httpGet(url);
  const $ = cheerio.load(buf.toString('utf-8'));
  return $;
}

diff_prettyHtml2 = function(diffs) {
  var DIFF_DELETE = -1;
  var DIFF_INSERT = 1;
  var DIFF_EQUAL = 0;

  var html = [];
  var pattern_amp = /&/g;
  var pattern_lt = /</g;
  var pattern_gt = />/g;
  var pattern_para = /\n/g;
  for (var x = 0; x < diffs.length; x++) {
    var op = diffs[x][0];    // Operation (insert, delete, equal)
    var data = diffs[x][1];  // Text of change.
    var text = data;
    switch (op) {
      case DIFF_INSERT:
        html[x] = '<ins style="background:#BDF2AC;">' + text + '</ins>';
        break;
      case DIFF_DELETE:
        html[x] = '<del style="background:#FFC0BC;">' + text + '</del>';
        break;
      case DIFF_EQUAL:
        html[x] = text;
        break;
    }
  }
  return html.join('');
};

makeSnapshot = function(err, db, country, web, timestamp) {
  var dmp = new diff_match_patch();
  var text1 = JSON.parse(db.web);
  var text2 = web.html();
  dmp.Diff_Timeout = 5;

  var d = dmp.diff_main(text1, text2);
  dmp.diff_cleanupSemantic(d);
  var ds = diff_prettyHtml2(d);

//  console.log(ds);

  nodeHtmlToImage({
    output: (DBfolder+country+'-'+timestamp+'.png'),
    html: '<head><style> body {width: 800px; height: 800px;}</style></head>'+ds
  })
    .then(() => console.log(country+' snapshot was created'))
}

getRec = function(err, rec, country, domain, page, item, web) {
  var url = domain + page + item;
  var webText = web.text();
  var webHash = hash(webText);
/*
  var date = new Date();
  var timestamp =
    date.getUTCFullYear()+'-'+(date.getUTCMonth()+1)+'-'+date.getUTCDay()+'_'+
    date.getUTCHours()+'_'+date.getUTCMinutes()+'_'+date.getUTCSeconds()+date.getUTCMilliseconds();
*/
  var timestamp = (new Date().toISOString()).replace(':','_').replace(':','_').replace('T','_').replace('.','');
//  console.log(timestamp);
//  console.log(country+' >> '+domain+page+item + ' ('+(rec==undefined?'no record':rec.timestamp)+')');
//  console.log(err, rec);
  var upd = false;
  var newrec = ['error'];
  if (rec != undefined) {
    if (rec.hash != webHash)
      upd = true;
  }
  else
    upd = true;
  if (upd) {
    console.log(country + ' ' + timestamp + ' hash changed to '+webHash);
    newrec = {country: country, timestamp: timestamp, url: url, hash: webHash};
  }
//  else
//    console.log(country + ' does not changed');
  if (upd) {
    var dbcc = nosql.load(DBfolder+country+'.nosql');
    if (rec == undefined)
      dba.insert(newrec)
    else
      dba.update(newrec).where('url', url);
  }
  if ((upd) && (rec!=undefined)) {
    dbcc.one().make(function(filter) {
        filter.where('timestamp', rec.timestamp);
        filter.callback(function(err, response) {makeSnapshot(err, response, country, web, timestamp);});
    });
  }
  if (upd)
    dbcc.insert({timestamp: timestamp, url: url, web: JSON.stringify(web.html())});
//  console.log(country + ' processed');
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const http = require('http'),
      https = require('https');

    let client = http;

    if (url.toString().indexOf("https") === 0) {
      client = https;
    }

    client.get(url, (resp) => {
      let chunks = [];

      // A chunk of data has been recieved.
      resp.on('data', (chunk) => {
        chunks.push(chunk);
      });

      // The whole response has been received. Print out the result.
      resp.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

    }).on("error", (err) => {
      console.log('error loading webpage');
      reject(err);
    });
  });
}

getWeb = async function(country, domain, page, item) {
//  console.log('web>>>'+country+' : '+domain+page+'     [[['+item+']]]');
  if (page!=undefined) {
    var url = domain + page + item;
    var buf = await httpGet(domain + page);
    const $ = cheerio.load(buf.toString('utf-8'));
    var web = $(item);
  //  console.log(web.text());
  //  console.log('--------------------------------');
    if (web.length > 0) {
      dba.one().make(function(filter) {
          filter.where('url', url);
          filter.callback(function(err, response) {getRec(err, response, country, domain, page, item, web);});
      });
    }
    else
      console.log('['+country + page + '] length is zero');
  }
};

function iterateList() {
  var t = 0;
  for (var i = 0; i < scraper.length; i++) {
//    setTimeout(processLine, t, scraper[i]['country'], scraper[i]['url'], scraper[i]['item']);
    setTimeout(getWeb, t, scraper[i]['country'], scraper[i]['domain'], scraper[i]['page'], scraper[i]['item']);
    t+=scraperDelay;
  }
}

function rebuildList() {
  var lastRegion, lastCountry, lastDomain;
  for (var i = 0; i < scraper.length; i++) {
    var t = scraper[i];
    if (t['region']!=undefined)
      lastRegion = t['region']
    else
      t['region'] = lastRegion;
    if (t['country']!=undefined)
      lastCountry = t['country']
    else
      t['country'] = lastCountry;
    if (t['domain']!=undefined)
      lastDomain = t['domain']
    else
      t['domain'] = lastDomain;
  }
//  console.log(JSON.stringify(scraper));
}

function getScraperList() {

  function getSheets() {
    const readerOptions = {
      sheetId: "1nhcEA_Hy7Hv0SFA-QCpJACL6AhPa6xj9Vp3_cUP6qTI",
      returnAllResults: true
    };

    googlesheets(readerOptions, (results) => {
      scraper = results;
      console.log(results.length + ' embassies loaded');
//      console.log(JSON.stringify(results));
      rebuildList();
      iterateList();
    });
  }

  scraper = [];
  getSheets();
}

//=== MAIN ===

getScraperList();
