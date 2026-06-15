@echo off
REM LocalStack S3 CORS — FE presigned PUT (ZIP import) from localhost:5173
set CONTAINER=graphnode-test-localstack
set BUCKET=taco5-graphnode-filedata-chat-and-note-s3

docker cp "%~dp0localstack-init\s3-import-cors.json" %CONTAINER%:/tmp/s3-import-cors.json
if errorlevel 1 exit /b 1

docker exec %CONTAINER% awslocal s3api put-bucket-cors --bucket %BUCKET% --cors-configuration file:///tmp/s3-import-cors.json
if errorlevel 1 exit /b 1

docker exec %CONTAINER% awslocal s3api get-bucket-cors --bucket %BUCKET%
echo ==^> S3 CORS applied for %BUCKET%
