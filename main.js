//Visa scraper bot
//2021 MIT License
//Telegram @MiniTHC or onefabcom@gmail.com

const cheerio = require('cheerio');
var nosql = require('nosql');
var hash = require('object-hash');
var googlesheets = require('g-sheets-api');
const nodeHtmlToImage = require('node-html-to-image');
var diff_match_patch = require('diff-match-patch');
var fs = require('fs');
var log = require('single-line-log2').stdout;

var googleSheetId = "1nhcEA_AAAAAAAAA-BBBBBBBBBBBBBBBBBBB_CCCCCCC";   //see g-sheets-api manual how to properly share your spreadsheet
var DBfolder = 'db/';
var dba = nosql.load(DBfolder+'alpha.nosql');
const scraperDelay = 200;
const scraperTimeout = 15000;
const maxThreads = 5;
var th = [];
var ttext = [];
var tstatus = [];
var scraper = [];
var scraperIndex = 0;

//async - await
async function loadPage(url) {
  var buf = await httpGet(url);
  const $ = cheerio.load(buf.toString('utf-8'));
  return $;
}

htmlCompare3 = function(html1, html2) {
  const mark = '¤';
  var tags = [];

  function insertTags(text, topen, tclose) {
    var k;
    var s = text;
    do {
      k = s.indexOf(mark);
      if (k!=-1)
        s = s.substring(0, k-1) + tclose + tags.shift() + topen + s.substring(k+1, s.length);
    } while (k!=-1)
    return s;
  }

  diff_prettyHtml3 = function(diffs) {
    var DIFF_DELETE = -1;
    var DIFF_INSERT = 1;
    var DIFF_EQUAL = 0;
    const ins1 = '<ins style="background:#BDF2AC;">';
    const ins2 = '</ins>';
    const del1 = '<del style="background:#FFC0BC;">';
    const del2 = '</del>';

    var html = [];
    for (var x = 0; x < diffs.length; x++) {
      var op = diffs[x][0];    // Operation (insert, delete, equal)
      var data = diffs[x][1];  // Text of change.
      var text = data;
      switch (op) {
        case DIFF_INSERT:
          html[x] = ins1 + insertTags(text, ins1, ins2) + ins2;
          break;
        case DIFF_DELETE:
          html[x] = del1 + text.split(mark).join('') + del2;
          break;
        case DIFF_EQUAL:
          html[x] = insertTags(text, '', '');
          break;
      }
    }
    return html.join('');
  };

  function removeTags(html, save = false) {
    var txt = '';
    var s = 0;
    var e = 0;
    var l = 0;
    var found;
    do {
      s = html.indexOf('<', l);
      e = html.indexOf('>', l);
      found = ((s!=-1)&&(e!=-1));
      if (found) {
        txt = txt + html.substring(l, s) + mark;
        if (save)
          tags.push(html.substring(s, e+1));
        l = e+1;
      }
    } while (found);
//    log(tags);
//    log(txt);
    return txt;
  }

  var dmp = new diff_match_patch();
  dmp.Diff_Timeout = 5;

  var text2 = removeTags(html2, true);
  var text1 = removeTags(html1, false);
  var d = dmp.diff_main(text1, text2);
  dmp.diff_cleanupSemantic(d);
  return diff_prettyHtml3(d);
}

function updateLog() {
  s = '';
  for (var i = 0; i < maxThreads; i++) {
    if (ttext[i])
      s = s + ttext[i];
    if (tstatus[i])
      s = s + ' '+ tstatus[i];
    s = s + '     ';
  }
  log(s);
}

makeSnapshot = function(err, db, country, web, timestamp) {
  nodeHtmlToImage({
    output: (DBfolder+country+'-'+timestamp+'.png'),
    html: '<head><style> body {width: 800px; height: 800px;}</style></head>'+htmlCompare3(JSON.parse(db.web), web.html())
  })
    .then(() => {console.log(country+' snapshot was created'); log.clear();})

}

testDiffsGet = function(err, response) {
  log(err);
  log.clear();
//  log(response);
  var timestamp = (new Date().toISOString()).replace(':','_').replace(':','_').replace('T','_').replace('.','');
  var country = '__';
  nodeHtmlToImage({
    output: (DBfolder+country+'-'+timestamp+'.png'),
    html: '<head><style> body {width: 800px; height: 800px;}</style></head>'+htmlCompare3(JSON.parse(response[0].web), '')//JSON.parse(response[1].web))
  })
    .then(() => {console.log(country+' snapshot was created'); log.clear();})
//  makeSnapshot();
}

testDiffs = function() {
    var dbcc = nosql.load(DBfolder+'TJ.nosql');
    dbcc.find().make(function(filter) {
        filter.where('url', 'https://TJ.usembassy.gov/visas/.mo-page-content');
        filter.callback(function(err, response) {testDiffsGet(err, response);});
    });
}

getRec = function(err, rec, thread, country, domain, page, item, web) {
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
//  log(timestamp);
//  log(country+' >> '+domain+page+item + ' ('+(rec==undefined?'no record':rec.timestamp)+')');
//  log(err, rec);
  var upd = false;
  var newrec = ['error'];
  if (rec != undefined) {
    if (rec.hash != webHash)
      upd = true;
  }
  else
    upd = true;
  if (upd) {
    tstatus[thread] = '+++';
    updateLog();
    log.clear();
    console.log(country + ' ' + timestamp + ' hash changed to '+webHash);
    log.clear();
    newrec = {country: country, timestamp: timestamp, url: url, hash: webHash};
  } else {
    tstatus[thread] = 'xxx';
    updateLog();
  }
//  else
//    log(country + ' does not changed');
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
//  log(country + ' processed');
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
      log.clear();
      reject(err);
    });
  });
}

getWeb = async function(thread, country, domain, page, item) {
  tstatus[thread] = '...';
  updateLog();
//  log('web>>>'+country+' : '+domain+page+'     [[['+item+']]]');
  if (page!=undefined) {
    var url = domain + page + item;
    var buf = await httpGet(domain + page);
    tstatus[thread] = 'x..';
    const $ = cheerio.load(buf.toString('utf-8'));
    tstatus[thread] = 'xx.';
    updateLog();
    var web = $(item);
    if (web.length > 0) {
      dba.one().make(function(filter) {
          filter.where('url', url);
          filter.callback(function(err, response) {getRec(err, response, thread, country, domain, page, item, web);});
      });
      trySchedule(thread, true);
    }
    else {
      console.log('['+country + page + '] length is zero');
      log.clear();
    }
  }
};

function trySchedule(thread, force = false) {
  if (force)
    th[thread] = 0;
  if ((Date.now()-th[thread]) >= scraperTimeout) {
    if (scraperIndex < scraper.length) {
      var r = scraper[scraperIndex];
      th[thread] = Date.now();
      ttext[thread] = r['country']+' '+scraperIndex;
      setTimeout(getWeb, scraperDelay, thread, r['country'], r['domain'], r['page'], r['item']);
    }
    scraperIndex++;
    if (scraperIndex < scraper.length)
      setTimeout(trySchedule, scraperTimeout, thread);
  }
}

function iterateList() {
  var t = 0;
  for (var j = 0; j < maxThreads; j++)
    trySchedule(j, true);
/*
  for (var i = 0; i < scraper.length; i++) {
//    setTimeout(processLine, t, scraper[i]['country'], scraper[i]['url'], scraper[i]['item']);
    setTimeout(getWeb, t, 1, scraper[i]['country'], scraper[i]['domain'], scraper[i]['page'], scraper[i]['item']);
    t+=scraperDelay;
  }
*/
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
//  log(JSON.stringify(scraper));
}

function getScraperList() {

  function getSheets() {
    const readerOptions = {
      sheetId: googleSheetId,
      returnAllResults: true
    };

    googlesheets(readerOptions, (results) => {
      scraper = results;
      console.log('List of ' + results.length + ' items loaded');
      log.clear();
//      log(JSON.stringify(results));
      rebuildList();
      iterateList();
    });
  }

  scraper = [];
  getSheets();
}

function checkDBfolder() {
  if (!fs.existsSync(DBfolder)){
      fs.mkdirSync(DBfolder);
  }
}

function prepareThreads() {
  for (i = 0; i < maxThreads; i++)
    th[i] = 0;
}

//=== MAIN ===

checkDBfolder();
//testDiffs();
prepareThreads();
getScraperList();
