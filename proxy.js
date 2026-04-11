const https = require('https');
const http = require('http');

const API_KEY = 'sk-ant-api03-Y5NCBe_8gHxz-uU0szgIIXa6EUvjw2CjNOg8-1QOMJGEOe2mqLystDePf4dbhuidXINuJePLnL4Wqv91zn67Mw-mlsccQAA';

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      }
    };
    
    const r = https.request(options, (resp) => {
      res.writeHead(resp.statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      resp.pipe(res);
    });
    
    r.on('error', (e) => {
      res.writeHead(500);
      res.end(JSON.stringify({error: e.message}));
    });
    
    r.write(body);
    r.end();
  });
}).listen(3001, () => console.log('Proxy OK on 3001'));
