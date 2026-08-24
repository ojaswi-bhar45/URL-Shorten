INSERT INTO urls ("shortCode", "longUrl")
SELECT 'lag' || generate_series, 'https://example.com/' || generate_series
FROM generate_series(1, 1000);
