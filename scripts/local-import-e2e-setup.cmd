@echo off
setlocal
REM 로컬 ZIP import E2E — Docker + LocalStack + File Service DB 초기화
REM GraphNode_BE 폴더에서 실행

cd /d "%~dp0.."

echo ==^> 1. Docker infra (postgres, mongo, redis, neo4j, chroma, localstack)
docker compose -f docker-compose.test.yml up -d postgres mongo redis neo4j chroma localstack
if errorlevel 1 exit /b 1

echo ==^> 2. File Service DB 생성 (최초 1회)
docker exec graphnode-test-postgres psql -U app -d postgres -c "SELECT 1 FROM pg_database WHERE datname='graphnode_file_service'" | findstr /C:"1 row" >nul
if errorlevel 1 (
  docker exec graphnode-test-postgres psql -U app -d postgres -c "CREATE DATABASE graphnode_file_service;"
)

echo ==^> 3. Mongo replica set — host를 localhost로 (호스트 BE용)
docker exec graphnode-test-mongo mongosh --quiet --eval "try { const s=rs.status(); if(s.members[0].name!=='localhost:27017'){ const c=rs.conf(); c.members[0].host='localhost:27017'; rs.reconfig(c,{force:true}); } } catch(e) { rs.initiate({_id:'rs0',members:[{_id:0,host:'localhost:27017'}]}); }"

echo ==^> 4. LocalStack S3/SQS/CORS
call scripts\ensure-localstack-cors.cmd
docker exec graphnode-test-localstack awslocal s3 mb s3://taco5-graphnode-graphdata-s3 --region ap-northeast-2 2>nul
docker exec graphnode-test-localstack awslocal s3 mb s3://taco5-graphnode-filedata-chat-and-note-s3 --region ap-northeast-2 2>nul
docker exec graphnode-test-localstack awslocal sqs create-queue --queue-name taco-graphnode-import-sqs --region ap-northeast-2

echo ==^> 5. File Service Prisma schema
cd /d "%~dp0..\..\GraphNode_BE_File_Service"
call npm run db:push

echo.
echo ==^> Setup done. Start 4 processes (각각 별도 CMD, Infisical X):
echo    cd GraphNode_BE_File_Service ^& npm run dev
echo    cd GraphNode_BE_File_Service ^& npm run dev:worker
echo    cd GraphNode_BE ^& npm run dev
echo    cd GraphNode_Front ^& npm run dev
echo.
echo Front: .env.local VITE_API_BASE=http://localhost:3000
echo Test login: POST http://localhost:3000/auth/test-login (x-internal-token: dev-import-test-secret)
