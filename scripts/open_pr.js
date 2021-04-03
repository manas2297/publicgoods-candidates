const fs = require('fs');
const path = require('path');
const btoa = require('btoa');
const request = require('request');
const { resolve } = require('path');

const githubUser = 'manas2297';
const githubRepo = 'products';
const baseURL = 'https://api.github.com/repos/' + githubUser + '/' + githubRepo + '/';

const branchName = 'unicef/publicgoods-candidates-'+process.env.GITHUB_SHA.substring(0, 8);

options = {
  auth: {
    'user': 'manas2297',
    'pass': process.env.GITHUBTOKEN
  },
  headers: {
    'User-Agent': 'request',
    'Accept': 'application/vnd.github.v3+json'
  }
}

function apiCall(my_options, MODE = 'GET') {
  if (MODE === 'GET') {
    const promise = new Promise((resolve, reject) => {
      request.get(my_options, function(error, response, body) {
        if(error){
          reject(error);
        }else{
          if(response.statusCode==200){
            resolve(JSON.parse(body));
          } else {
            resolve(null);
          }
        }
      });
    }).then(data => data);
    return promise;
  } else if (MODE === 'POST') {
    const promise = new Promise((resolve, reject) => {
      request.post(my_options, function(error, response, body) {
        if(error){
          reject(error);
        }else{
          if(response.statusCode === 201) {
            console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
            resolve(JSON.parse(body));
          }else {
            resolve(null);
          }
        }
      });
    }).then(data => data);
    return promise;
  }
}

/** 
 * Returns a Javascript object (array) of the files that have changed
 * @return {Array} List of changed files
 */
function getChangedFiles(){
  var obj = JSON.parse(fs.readFileSync(path.join(process.env.HOME,'files.json'), 'utf8'));
  return obj;
}

/** Checks if any of the changed files are of our interest to run this script
 */
function run(){
  const files = getChangedFiles();
  let found = false;
  for(file of files) {
    if (file.match(/nominees\/.*\.json/)) {
      found = true;
      break
    }
  }
  if(found){
    getHead()
  } else {
    console.log('No nominee files have changed or been added. Not running script.')
  }
}

/** Gets a pointer to the latest commit of master branch
 * @return {string} SHA of latest commit
 */
function getHead() {
  my_options = options;
  my_options['url'] = baseURL + 'git/ref/heads/master'
  request(my_options, function (error, response, body) {
    if(error) { 
      console.error('error:', error); // Print the error if one occurred
    } else {
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      console.log('body:', body); // Print the body
      response = JSON.parse(body);
      head = response['object']['sha'];
      createBranch(head);
    }
  });
}

/** Creates a new branch using a global branchName variable
 * @param {string} SHA of where to create a branch in the tree
 */
function createBranch(head) {
  my_options = options;
  my_options['url'] = baseURL + 'git/refs';
  my_options['body'] = JSON.stringify({
    "ref": "refs/heads/" + branchName,
    "sha": head
  });

  request.post(my_options, function (error, response, body) {
    if(error) {
      console.error('error:', error); // Print the error if one occurred
    } else {
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      console.log('body:', body); // Print the body
      commitFiles(head);
    }
  });
}

/** Commits the files that have changed
 */
async function commitFiles(head){
  const files = getChangedFiles();
  console.log('These are the files that have changed:')
  console.log(files);
  let commitFiles = []
  for (file of files) { 
    if (file.match(/nominees\/.*\.json/)) {

      let commitFile = file.replace(/^nominees/,'products');

      commitFiles.push(commitFile);

      let my_options = options;
      my_options['url'] = baseURL + 'contents/' + commitFile;

      
      let responseIfFileExists;
      let fileContents;
      try{
        let promise = await apiCall(my_options);
        responseIfFileExists = promise;
        if (!fs.existsSync(file)) {
          my_options['url'] = baseURL + 'git/trees/' + head;
          let base_tree = await apiCall(my_options); // for original
          console.log(base_tree);
          const productTree = base_tree.tree.filter(item => item.path === 'products');
          console.log(productTree);
          my_options['url'] = productTree[0].url;
          const productTreeList = await apiCall(my_options); // products folder list
          // console.log(productTreeList);
          const newProductTreeList = productTreeList.tree.filter(item => item.path !== file.split('/')[1]);
          console.log(newProductTreeList,"new Product");
          my_options['url'] = baseURL + 'git/trees'; // to create a new product tree without the file
          my_options['body'] = JSON.stringify({
            "tree": newProductTreeList,
          });
          const newPL = await apiCall(my_options, 'POST');
          console.log(newPL, 'newPL');
          base_tree = base_tree.tree.map(item => {
            if (item.path === 'products') {
              item.sha = newPL.sha;
              item.url = newPL.url;
              return item;
            }
            return item;
          });
          my_options['body'] = JSON.stringify({
            "tree": base_tree,
          });
          console.log(my_options);
          const newBaseTree = await apiCall(my_options, 'POST');
          console.log(newBaseTree);
          //commit create krna hai
          let body = {
            'message': 'BLD: delete file' + file,
            'sha': newBaseTree.sha,
          };

          my_options['body'] = JSON.stringify(body);
          my_options['url'] = baseURL + 'git/commits';
          const response = await apiCall(my_options, 'POST');
          console.log(response, 'reponse');




        }
        else console.log("file not deleted")


        fileContents = fs.readFileSync(file, 'utf8')
        var body = {
          'content': btoa(fileContents),
          'branch': branchName
        }
        if(responseIfFileExists){
          body['message'] = 'BLD: edit file ' + file;
          body['sha'] = responseIfFileExists['sha'];
        }else{
          body['message'] = 'BLD: add file ' + file;
        }
        my_options['body'] = JSON.stringify(body);
  
        promise = new Promise((resolve, reject) => {
          request.put(my_options, function(error, response, body) {
            if(error){
              reject(error);
            }else{
              resolve(body);
            }
          });
        });
        response = await promise;
        console.log('Received response: ' + response)
      } catch (err) {
        console.error(err.message);
      }
    }
  }
  createPR(commitFiles);
}

/** Creates a new PR using global branchName variable
 * @param {Array} List of files that have changed in this PR
 */
function createPR(files){
  my_options = options;
  my_options['url'] = baseURL + 'pulls';
  my_options['body'] = JSON.stringify({
    'title': 'Add new product(s): ' + files.toString(),
    'head': branchName,
    'base': 'master',
    'body': 'Add new product(s) from [unicef/publicgoods-candidates](https://github.com/unicef/publicgoods/candidates)'
  })

  request.post(options, function (error, response, body) {
    if(error) {
      console.error('error:', error); // Print the error if one occurred
    } else {
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      console.log('body:', body); // Print the body

      response = JSON.parse(body);
      numPR = response['number'];

      assignPR(numPR);
    }
  });
}

/** Assigns a PR to a list of GitHub users
 * @param {number} PR number to assign
 */
function assignPR(numPR) {
  my_options = options;
  my_options['url'] = baseURL + 'issues/' + numPR;
  my_options['body'] = JSON.stringify({
    'assignees': [
      'ericboucher',
      'conradsp'
    ]
  })

  request.patch(options, function (error, response, body) {
    if(error) {
      console.error('error:', error); // Print the error if one occurred
    } else {
      console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
      console.log('body:', body); // Print the body
    }
  });
}

run();