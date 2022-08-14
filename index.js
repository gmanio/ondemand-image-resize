const querystring = require('querystring');
const AWS = require('aws-sdk');
const Sharp = require('sharp');
const convert = require('heic-convert');

// region 지정
const S3 = new AWS.S3({
  region: 'ap-northeast-2',
});

// bucket명 지정
const BUCKET = 'leenhan-figma';

// 디폴트 사이즈
const MAX_WIDTH = 1500;
const MAX_HEIGHT = 1500;

const allowedExtension = ['jpg', 'jpeg', 'png', 'webp', 'heic'];

exports.handler = (event, context, callback) => {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;

  const params = querystring.parse(request.querystring);
  const width = isNaN(parseInt(params.w)) || parseInt(params.w) <= 0 ? MAX_WIDTH : Math.min(parseInt(params.w), MAX_WIDTH);
  const height = isNaN(parseInt(params.h)) || parseInt(params.h) <= 0 ? MAX_HEIGHT : Math.min(parseInt(params.h), MAX_HEIGHT);

  const uri = request.uri;
  const [imageName, extension] = uri.match(/\/(.*)\.(.*)/);

  // 리사이즈 이미지 format.
  const requiredFormat = extension == 'webp' ? 'webp' : 'jpeg';
  const originalKey = `${imageName}.${extension}`;

  // 대응 이미지 체크
  if (!allowedExtension.includes(extension)) {
    response.status = '500';
    response.headers['content-type'] = [{ key: 'Content-Type', value: 'text/plain' }];
    response.body = `${extension} is not allowed`;
    callback(null, response);
    return;
  }

  // S3에서 이미지를 읽어옵니다.
  S3.getObject({ Bucket: BUCKET, Key: originalKey })
    .promise()
    // heic 파일인 경우에는 jpeg로 변경한 후 처리했습니다.
    .then((data) => {
      if (extension === 'heic') {
        return convert({
          buffer: data.Body,
          format: 'JPEG',
          quality: 1,
        });
      } else {
        return data.Body;
      }
    })
    .then((input) => {
      const image = Sharp(input);
      image
        .metadata()
        .then((meta) => {
          const resizeWidth = Math.min(meta.width, width);
          const resizeHeight = Math.min(meta.height, height);
          // 이미지를 리사이징 합니다.
          return image
            .resize({
              width: resizeWidth,
              height: resizeHeight,
              fit: 'inside',
            })
            .toFormat(requiredFormat)
            .toBuffer();
        })
        .then((buffer) => {
          // response에 리사이징 한 이미지를 담아서 반환합니다.
          response.status = 200;
          response.body = buffer.toString('base64');
          response.bodyEncoding = 'base64';
          response.headers['content-type'] = [{ key: 'Content-Type', value: 'image/' + requiredFormat }];
          callback(null, response);
        });
    })
    .catch((e) => {
      response.status = '404';
      response.headers['content-type'] = [{ key: 'Content-Type', value: 'text/plain' }];
      response.body = `${request.uri} is not found.`;
      callback(null, response);
    });
};
