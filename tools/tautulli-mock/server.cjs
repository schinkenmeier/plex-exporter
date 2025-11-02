const http = require('http');

const port = Number.parseInt(process.env.PORT ?? '8181', 10);

const librariesPayload = JSON.stringify({
  response: {
    result: 'success',
    message: null,
    data: {
      libraries: [
        {
          section_id: 1,
          section_name: 'Mock Movies',
          section_type: 'movie',
          count: 42,
        },
        {
          section_id: 2,
          section_name: 'Mock Shows',
          section_type: 'show',
          count: 13,
        },
      ],
    },
  },
});

const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/api/v2')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(librariesPayload);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Tautulli mock listening on port ${port}`);
});
