rm -rf extension-build
DIR_NAME=extension-build
mkdir $DIR_NAME

npm run build:content-script
npm run build:background
npm run build:popup
npm run build:app
cp -r ./dist $DIR_NAME
cp -r ./public $DIR_NAME
cp extension-options* $DIR_NAME
cp app* $DIR_NAME
cp manifest.json $DIR_NAME
