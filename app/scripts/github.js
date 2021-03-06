'use strict';
var LocalStorage = require('./localStorage'),
    React = require('react');
var Github = (function() {
  return {
    apiUrl: 'https://api.github.com',
    getAuthHeaders: function() {
      return {
        'Authorization': 'token ' + LocalStorage.get('token')
      };
    },
    getJSON: function(path, extraHeaders) {
      var headers;
      if (typeof extraHeaders === 'undefined') {
        headers = this.getAuthHeaders();
      } else {
        headers = $.extend(this.getAuthHeaders(), extraHeaders);
      }
      var url;
      if (path.indexOf('http') === 0) {
        url = path;
      } else {
        url = this.apiUrl + path;
      }
      return $.ajax({dataType: 'json', url: url, headers: headers});
    },
    getNextPageUrl: function(linkHeader) {
      // e.g., <https://api.github.com/user/repos?per_page=100&page=2>; rel="next",
      //       <https://api.github.com/user/repos?per_page=100&page=4>; rel="last"
      if (!linkHeader) {
        return null;
      }
      var segments = linkHeader.split(',');
      for (var i=0; i<segments.length; i++) {
        var segment = $.trim(segments[i]);
        var bits = segment.split(';');
        var rel = bits[1];
        if (rel.indexOf('rel="next"') < 0) {
          continue;
        }
        var url = bits[0];
        var lessThanIndex = url.indexOf('<');
        var greaterThanIndex = url.indexOf('>');
        return url.slice(lessThanIndex + 1, greaterThanIndex);
      }
      return null;
    },
    getPaginatedJSON: function(path, extraHeaders) {
      if (path.indexOf('per_page=') < 0) {
        path += (path.indexOf('?') > -1 ? '&' : '?') + 'per_page=100';
      }
      return $.Deferred(function(defer) {
        var results = [];
        var onSuccess = function(data, textStatus, request) {
          results = results.concat(data);
          var link = request.getResponseHeader('Link');
          var nextPageUrl = this.getNextPageUrl(link);
          if (nextPageUrl) {
            this.getJSON(nextPageUrl, extraHeaders).
                 success(onSuccess).error(defer.reject);
          } else {
            defer.resolve(results);
          }
        }.bind(this);
        this.getJSON(path, extraHeaders).
             success(onSuccess).error(defer.reject);
      }.bind(this)).promise();
    },
    getUser: function() {
      return $.Deferred(function(defer) {
        var user = LocalStorage.get('user');
        if (user) {
          defer.resolve(user);
        } else {
          var onSuccess = function(data) {
            user = {html_url: data.html_url,
                    avatar_url: data.avatar_url,
                    login: data.login,
                    name: data.name};
            LocalStorage.set('user', user);
            defer.resolve(user);
          }.bind(this);
          this.getJSON('/user').then(onSuccess, defer.reject);
        }
      }.bind(this)).promise();
    },
    getOrgs: function() {
      return this.getPaginatedJSON('/user/orgs');
    },
    getOrgNames: function() {
      return $.Deferred(function(defer) {
        var orgNames = LocalStorage.get('orgNames');
        if (orgNames) {
          defer.resolve(orgNames);
        } else {
          orgNames = [];
          var onSuccess = function(orgs) {
            for (var i=0; i<orgs.length; i++) {
              orgNames.push(orgs[i].login);
            }
            LocalStorage.set('orgNames', orgNames);
            defer.resolve(orgNames);
          };
          this.getOrgs().then(onSuccess, defer.reject);
        }
      }.bind(this)).promise();
    },
    getUserRepos: function() {
      return $.Deferred(function(defer) {
        var repos = LocalStorage.get('repos');
        if (repos) {
          defer.resolve(repos);
        } else {
          var onSuccess = function(data) {
            repos = data.map(function(repo) {
              return {
                full_name: repo.full_name,
                private: repo.private
              };
            });
            LocalStorage.set('repos', repos);
            defer.resolve(repos);
          }.bind(this);
          this.getPaginatedJSON(
            '/user/repos?sort=pushed',
            {'Accept': 'application/vnd.github.moondragon+json'}
          ).then(onSuccess, defer.reject);
        }
      }.bind(this)).promise();
    },
    getUserIssues: function(sinceDate) {
      var sinceStr = sinceDate.toISOString();
      return this.getPaginatedJSON('/user/issues?filter=all&state=closed&since=' +
                                   sinceStr);
    },
    getRepoIssues: function(fullName, sinceDate) {
      var sinceStr = sinceDate.toISOString();
      return this.getPaginatedJSON('/repos/' + fullName + '/issues?state=closed' +
                                   '&since=' + sinceStr + '&sort=updated');
    },
    getAllRepoIssues: function(fullNames, sinceDate) {
      return $.Deferred(function(defer) {
        var statuses = {};
        var allIssues = [];
        var callback = function() { defer.resolve(allIssues); };
        fullNames.forEach(function(fullName) {
          statuses[fullName] = 'pending';
          var onSuccess = function(repoIssues) {
            allIssues = allIssues.concat(repoIssues);
            statuses[fullName] = 'success'
            this.resolveIfNecessary(statuses, callback);
          }.bind(this);
          var onError = function() {
            statuses[fullName] = 'failure';
            this.resolveIfNecessary(statuses, callback);
          }.bind(this);
          this.getRepoIssues(fullName, sinceDate).then(onSuccess, onError);
        }.bind(this));
      }.bind(this)).promise();
    },
    getOrgRepos: function(orgName) {
      return this.getPaginatedJSON('/orgs/' + orgName + '/repos');
    },
    resolveIfNecessary: function(statuses, callback) {
      var finished = true;
      for (var key in statuses) {
        var status = statuses[key];
        if (status === 'pending') {
          finished = false;
          break;
        }
      }
      if (finished) {
        callback();
      }
    },
    getAllOrgRepos: function(orgNames) {
      return $.Deferred(function(defer) {
        var statuses = {};
        var allRepos = [];
        var callback = function() { defer.resolve(allRepos); };
        orgNames.forEach(function(name) {
          statuses[name] = 'pending';
          var onSuccess = function(orgRepos) {
            allRepos = allRepos.concat(orgRepos);
            statuses[name] = 'success'
            this.resolveIfNecessary(statuses, callback);
          }.bind(this);
          var onError = function() {
            statuses[name] = 'failure';
            this.resolveIfNecessary(statuses, callback);
          }.bind(this);
          this.getOrgRepos(name).then(onSuccess, onError);
        }.bind(this));
      }.bind(this)).promise();
    },
    getRepos: function() {
      return $.Deferred(function(defer) {
        this.getUserRepos().then(function(userRepos) {
          this.getOrgNames().then(function(orgNames) {
            this.getAllOrgRepos(orgNames).then(function(orgRepos) {
              defer.resolve(userRepos.concat(orgRepos));
            }, defer.reject);
          }.bind(this), defer.reject);
        }.bind(this), defer.reject);
      }.bind(this)).promise();
    },
    getCommits: function(fullName, author, sinceDate, untilDate) {
      var sinceStr = sinceDate.toISOString();
      var untilStr = untilDate.toISOString();
      var url = '/repos/' + fullName + '/commits?author=' +
                encodeURIComponent(author) + '&since=' + sinceStr +
                '&until=' + untilStr;
      return this.getPaginatedJSON(url);
    },
    getCommitsFromRepos: function(repos, author, sinceDate, untilDate) {
      return $.Deferred(function(defer) {
        var statuses = {};
        var allCommits = [];
        var callback = function() { defer.resolve(allCommits); };
        var fullNames = [];
        for (var i=0; i<repos.length; i++) {
          fullNames.push(repos[i].full_name);
        }
        fullNames.forEach(function(fullName) {
          statuses[fullName] = 'pending';
          var onSuccess = function(repoCommits) {
            for (var i=0; i<repoCommits.length; i++) {
              repoCommits[i].full_name = fullName;
            }
            allCommits = allCommits.concat(repoCommits);
            statuses[fullName] = 'success';
            this.resolveIfNecessary(statuses, callback);
          }.bind(this);
          var onError = function() {
            statuses[fullName] = 'failure';
            this.resolveIfNecessary(statuses, callback);
          }.bind(this);
          this.getCommits(fullName, author, sinceDate, untilDate).
               then(onSuccess, onError);
        }.bind(this));
      }.bind(this)).promise();
    }
  };
})();
module.exports = Github;
