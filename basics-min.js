(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";

module.exports = require('./lib/axios');
},{"./lib/axios":3}],2:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var cookies = require('./../helpers/cookies');
var buildURL = require('./../helpers/buildURL');
var buildFullPath = require('../core/buildFullPath');
var parseHeaders = require('./../helpers/parseHeaders');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var transitionalDefaults = require('../defaults/transitional');
var AxiosError = require('../core/AxiosError');
var CanceledError = require('../cancel/CanceledError');
var parseProtocol = require('../helpers/parseProtocol');
module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data;
    var requestHeaders = config.headers;
    var responseType = config.responseType;
    var onCanceled;
    function done() {
      if (config.cancelToken) {
        config.cancelToken.unsubscribe(onCanceled);
      }
      if (config.signal) {
        config.signal.removeEventListener('abort', onCanceled);
      }
    }
    if (utils.isFormData(requestData) && utils.isStandardBrowserEnv()) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    var request = new XMLHttpRequest();

    // HTTP basic authentication
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }
    var fullPath = buildFullPath(config.baseURL, config.url);
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    request.timeout = config.timeout;
    function onloadend() {
      if (!request) {
        return;
      }
      // Prepare the response
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      var responseData = !responseType || responseType === 'text' || responseType === 'json' ? request.responseText : request.response;
      var response = {
        data: responseData,
        status: request.status,
        statusText: request.statusText,
        headers: responseHeaders,
        config: config,
        request: request
      };
      settle(function _resolve(value) {
        resolve(value);
        done();
      }, function _reject(err) {
        reject(err);
        done();
      }, response);

      // Clean up request
      request = null;
    }
    if ('onloadend' in request) {
      // Use onloadend if available
      request.onloadend = onloadend;
    } else {
      // Listen for ready state to emulate onloadend
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }

        // The request errored out and we didn't get a response, this will be
        // handled by onerror instead
        // With one exception: request that using file: protocol, most browsers
        // will return status as 0 even though it's a successful request
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
          return;
        }
        // readystate handler is calling before onerror or ontimeout handlers,
        // so we should call onloadend on the next 'tick'
        setTimeout(onloadend);
      };
    }

    // Handle browser request cancellation (as opposed to a manual cancellation)
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }
      reject(new AxiosError('Request aborted', AxiosError.ECONNABORTED, config, request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, request, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    request.ontimeout = function handleTimeout() {
      var timeoutErrorMessage = config.timeout ? 'timeout of ' + config.timeout + 'ms exceeded' : 'timeout exceeded';
      var transitional = config.transitional || transitionalDefaults;
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      reject(new AxiosError(timeoutErrorMessage, transitional.clarifyTimeoutError ? AxiosError.ETIMEDOUT : AxiosError.ECONNABORTED, config, request));

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    if (utils.isStandardBrowserEnv()) {
      // Add xsrf header
      var xsrfValue = (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName ? cookies.read(config.xsrfCookieName) : undefined;
      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    if (responseType && responseType !== 'json') {
      request.responseType = config.responseType;
    }

    // Handle progress if needed
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }
    if (config.cancelToken || config.signal) {
      // Handle cancellation
      // eslint-disable-next-line func-names
      onCanceled = function onCanceled(cancel) {
        if (!request) {
          return;
        }
        reject(!cancel || cancel && cancel.type ? new CanceledError() : cancel);
        request.abort();
        request = null;
      };
      config.cancelToken && config.cancelToken.subscribe(onCanceled);
      if (config.signal) {
        config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
      }
    }
    if (!requestData) {
      requestData = null;
    }
    var protocol = parseProtocol(fullPath);
    if (protocol && ['http', 'https', 'file'].indexOf(protocol) === -1) {
      reject(new AxiosError('Unsupported protocol ' + protocol + ':', AxiosError.ERR_BAD_REQUEST, config));
      return;
    }

    // Send the request
    request.send(requestData);
  });
};
},{"../cancel/CanceledError":5,"../core/AxiosError":8,"../core/buildFullPath":10,"../defaults/transitional":16,"../helpers/parseProtocol":28,"./../core/settle":13,"./../helpers/buildURL":19,"./../helpers/cookies":21,"./../helpers/isURLSameOrigin":24,"./../helpers/parseHeaders":27,"./../utils":32}],3:[function(require,module,exports){
'use strict';

var utils = require('./utils');
var bind = require('./helpers/bind');
var Axios = require('./core/Axios');
var mergeConfig = require('./core/mergeConfig');
var defaults = require('./defaults');

/**
 * Create an instance of Axios
 *
 * @param {Object} defaultConfig The default config for the instance
 * @return {Axios} A new instance of Axios
 */
function createInstance(defaultConfig) {
  var context = new Axios(defaultConfig);
  var instance = bind(Axios.prototype.request, context);

  // Copy axios.prototype to instance
  utils.extend(instance, Axios.prototype, context);

  // Copy context to instance
  utils.extend(instance, context);

  // Factory for creating new instances
  instance.create = function create(instanceConfig) {
    return createInstance(mergeConfig(defaultConfig, instanceConfig));
  };
  return instance;
}

// Create the default instance to be exported
var axios = createInstance(defaults);

// Expose Axios class to allow class inheritance
axios.Axios = Axios;

// Expose Cancel & CancelToken
axios.CanceledError = require('./cancel/CanceledError');
axios.CancelToken = require('./cancel/CancelToken');
axios.isCancel = require('./cancel/isCancel');
axios.VERSION = require('./env/data').version;
axios.toFormData = require('./helpers/toFormData');

// Expose AxiosError class
axios.AxiosError = require('../lib/core/AxiosError');

// alias for CanceledError for backward compatibility
axios.Cancel = axios.CanceledError;

// Expose all/spread
axios.all = function all(promises) {
  return Promise.all(promises);
};
axios.spread = require('./helpers/spread');

// Expose isAxiosError
axios.isAxiosError = require('./helpers/isAxiosError');
module.exports = axios;

// Allow use of default import syntax in TypeScript
module.exports.default = axios;
},{"../lib/core/AxiosError":8,"./cancel/CancelToken":4,"./cancel/CanceledError":5,"./cancel/isCancel":6,"./core/Axios":7,"./core/mergeConfig":12,"./defaults":15,"./env/data":17,"./helpers/bind":18,"./helpers/isAxiosError":23,"./helpers/spread":29,"./helpers/toFormData":30,"./utils":32}],4:[function(require,module,exports){
'use strict';

var CanceledError = require('./CanceledError');

/**
 * A `CancelToken` is an object that can be used to request cancellation of an operation.
 *
 * @class
 * @param {Function} executor The executor function.
 */
function CancelToken(executor) {
  if (typeof executor !== 'function') {
    throw new TypeError('executor must be a function.');
  }
  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });
  var token = this;

  // eslint-disable-next-line func-names
  this.promise.then(function (cancel) {
    if (!token._listeners) return;
    var i;
    var l = token._listeners.length;
    for (i = 0; i < l; i++) {
      token._listeners[i](cancel);
    }
    token._listeners = null;
  });

  // eslint-disable-next-line func-names
  this.promise.then = function (onfulfilled) {
    var _resolve;
    // eslint-disable-next-line func-names
    var promise = new Promise(function (resolve) {
      token.subscribe(resolve);
      _resolve = resolve;
    }).then(onfulfilled);
    promise.cancel = function reject() {
      token.unsubscribe(_resolve);
    };
    return promise;
  };
  executor(function cancel(message) {
    if (token.reason) {
      // Cancellation has already been requested
      return;
    }
    token.reason = new CanceledError(message);
    resolvePromise(token.reason);
  });
}

/**
 * Throws a `CanceledError` if cancellation has been requested.
 */
CancelToken.prototype.throwIfRequested = function throwIfRequested() {
  if (this.reason) {
    throw this.reason;
  }
};

/**
 * Subscribe to the cancel signal
 */

CancelToken.prototype.subscribe = function subscribe(listener) {
  if (this.reason) {
    listener(this.reason);
    return;
  }
  if (this._listeners) {
    this._listeners.push(listener);
  } else {
    this._listeners = [listener];
  }
};

/**
 * Unsubscribe from the cancel signal
 */

CancelToken.prototype.unsubscribe = function unsubscribe(listener) {
  if (!this._listeners) {
    return;
  }
  var index = this._listeners.indexOf(listener);
  if (index !== -1) {
    this._listeners.splice(index, 1);
  }
};

/**
 * Returns an object that contains a new `CancelToken` and a function that, when called,
 * cancels the `CancelToken`.
 */
CancelToken.source = function source() {
  var cancel;
  var token = new CancelToken(function executor(c) {
    cancel = c;
  });
  return {
    token: token,
    cancel: cancel
  };
};
module.exports = CancelToken;
},{"./CanceledError":5}],5:[function(require,module,exports){
'use strict';

var AxiosError = require('../core/AxiosError');
var utils = require('../utils');

/**
 * A `CanceledError` is an object that is thrown when an operation is canceled.
 *
 * @class
 * @param {string=} message The message.
 */
function CanceledError(message) {
  // eslint-disable-next-line no-eq-null,eqeqeq
  AxiosError.call(this, message == null ? 'canceled' : message, AxiosError.ERR_CANCELED);
  this.name = 'CanceledError';
}
utils.inherits(CanceledError, AxiosError, {
  __CANCEL__: true
});
module.exports = CanceledError;
},{"../core/AxiosError":8,"../utils":32}],6:[function(require,module,exports){
'use strict';

module.exports = function isCancel(value) {
  return !!(value && value.__CANCEL__);
};
},{}],7:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var buildURL = require('../helpers/buildURL');
var InterceptorManager = require('./InterceptorManager');
var dispatchRequest = require('./dispatchRequest');
var mergeConfig = require('./mergeConfig');
var buildFullPath = require('./buildFullPath');
var validator = require('../helpers/validator');
var validators = validator.validators;
/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager()
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
Axios.prototype.request = function request(configOrUrl, config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  if (typeof configOrUrl === 'string') {
    config = config || {};
    config.url = configOrUrl;
  } else {
    config = configOrUrl || {};
  }
  config = mergeConfig(this.defaults, config);

  // Set config.method
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }
  var transitional = config.transitional;
  if (transitional !== undefined) {
    validator.assertOptions(transitional, {
      silentJSONParsing: validators.transitional(validators.boolean),
      forcedJSONParsing: validators.transitional(validators.boolean),
      clarifyTimeoutError: validators.transitional(validators.boolean)
    }, false);
  }

  // filter out skipped interceptors
  var requestInterceptorChain = [];
  var synchronousRequestInterceptors = true;
  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
      return;
    }
    synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
    requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
  });
  var responseInterceptorChain = [];
  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
  });
  var promise;
  if (!synchronousRequestInterceptors) {
    var chain = [dispatchRequest, undefined];
    Array.prototype.unshift.apply(chain, requestInterceptorChain);
    chain = chain.concat(responseInterceptorChain);
    promise = Promise.resolve(config);
    while (chain.length) {
      promise = promise.then(chain.shift(), chain.shift());
    }
    return promise;
  }
  var newConfig = config;
  while (requestInterceptorChain.length) {
    var onFulfilled = requestInterceptorChain.shift();
    var onRejected = requestInterceptorChain.shift();
    try {
      newConfig = onFulfilled(newConfig);
    } catch (error) {
      onRejected(error);
      break;
    }
  }
  try {
    promise = dispatchRequest(newConfig);
  } catch (error) {
    return Promise.reject(error);
  }
  while (responseInterceptorChain.length) {
    promise = promise.then(responseInterceptorChain.shift(), responseInterceptorChain.shift());
  }
  return promise;
};
Axios.prototype.getUri = function getUri(config) {
  config = mergeConfig(this.defaults, config);
  var fullPath = buildFullPath(config.baseURL, config.url);
  return buildURL(fullPath, config.params, config.paramsSerializer);
};

// Provide aliases for supported request methods
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function (url, config) {
    return this.request(mergeConfig(config || {}, {
      method: method,
      url: url,
      data: (config || {}).data
    }));
  };
});
utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/

  function generateHTTPMethod(isForm) {
    return function httpMethod(url, data, config) {
      return this.request(mergeConfig(config || {}, {
        method: method,
        headers: isForm ? {
          'Content-Type': 'multipart/form-data'
        } : {},
        url: url,
        data: data
      }));
    };
  }
  Axios.prototype[method] = generateHTTPMethod();
  Axios.prototype[method + 'Form'] = generateHTTPMethod(true);
});
module.exports = Axios;
},{"../helpers/buildURL":19,"../helpers/validator":31,"./../utils":32,"./InterceptorManager":9,"./buildFullPath":10,"./dispatchRequest":11,"./mergeConfig":12}],8:[function(require,module,exports){
'use strict';

var utils = require('../utils');

/**
 * Create an Error with the specified message, config, error code, request and response.
 *
 * @param {string} message The error message.
 * @param {string} [code] The error code (for example, 'ECONNABORTED').
 * @param {Object} [config] The config.
 * @param {Object} [request] The request.
 * @param {Object} [response] The response.
 * @returns {Error} The created error.
 */
function AxiosError(message, code, config, request, response) {
  Error.call(this);
  this.message = message;
  this.name = 'AxiosError';
  code && (this.code = code);
  config && (this.config = config);
  request && (this.request = request);
  response && (this.response = response);
}
utils.inherits(AxiosError, Error, {
  toJSON: function toJSON() {
    return {
      // Standard
      message: this.message,
      name: this.name,
      // Microsoft
      description: this.description,
      number: this.number,
      // Mozilla
      fileName: this.fileName,
      lineNumber: this.lineNumber,
      columnNumber: this.columnNumber,
      stack: this.stack,
      // Axios
      config: this.config,
      code: this.code,
      status: this.response && this.response.status ? this.response.status : null
    };
  }
});
var prototype = AxiosError.prototype;
var descriptors = {};
['ERR_BAD_OPTION_VALUE', 'ERR_BAD_OPTION', 'ECONNABORTED', 'ETIMEDOUT', 'ERR_NETWORK', 'ERR_FR_TOO_MANY_REDIRECTS', 'ERR_DEPRECATED', 'ERR_BAD_RESPONSE', 'ERR_BAD_REQUEST', 'ERR_CANCELED'
// eslint-disable-next-line func-names
].forEach(function (code) {
  descriptors[code] = {
    value: code
  };
});
Object.defineProperties(AxiosError, descriptors);
Object.defineProperty(prototype, 'isAxiosError', {
  value: true
});

// eslint-disable-next-line func-names
AxiosError.from = function (error, code, config, request, response, customProps) {
  var axiosError = Object.create(prototype);
  utils.toFlatObject(error, axiosError, function filter(obj) {
    return obj !== Error.prototype;
  });
  AxiosError.call(axiosError, error.message, code, config, request, response);
  axiosError.name = error.name;
  customProps && Object.assign(axiosError, customProps);
  return axiosError;
};
module.exports = AxiosError;
},{"../utils":32}],9:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
function InterceptorManager() {
  this.handlers = [];
}

/**
 * Add a new interceptor to the stack
 *
 * @param {Function} fulfilled The function to handle `then` for a `Promise`
 * @param {Function} rejected The function to handle `reject` for a `Promise`
 *
 * @return {Number} An ID used to remove interceptor later
 */
InterceptorManager.prototype.use = function use(fulfilled, rejected, options) {
  this.handlers.push({
    fulfilled: fulfilled,
    rejected: rejected,
    synchronous: options ? options.synchronous : false,
    runWhen: options ? options.runWhen : null
  });
  return this.handlers.length - 1;
};

/**
 * Remove an interceptor from the stack
 *
 * @param {Number} id The ID that was returned by `use`
 */
InterceptorManager.prototype.eject = function eject(id) {
  if (this.handlers[id]) {
    this.handlers[id] = null;
  }
};

/**
 * Iterate over all the registered interceptors
 *
 * This method is particularly useful for skipping over any
 * interceptors that may have become `null` calling `eject`.
 *
 * @param {Function} fn The function to call for each interceptor
 */
InterceptorManager.prototype.forEach = function forEach(fn) {
  utils.forEach(this.handlers, function forEachHandler(h) {
    if (h !== null) {
      fn(h);
    }
  });
};
module.exports = InterceptorManager;
},{"./../utils":32}],10:[function(require,module,exports){
'use strict';

var isAbsoluteURL = require('../helpers/isAbsoluteURL');
var combineURLs = require('../helpers/combineURLs');

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 * @returns {string} The combined full path
 */
module.exports = function buildFullPath(baseURL, requestedURL) {
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    return combineURLs(baseURL, requestedURL);
  }
  return requestedURL;
};
},{"../helpers/combineURLs":20,"../helpers/isAbsoluteURL":22}],11:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var transformData = require('./transformData');
var isCancel = require('../cancel/isCancel');
var defaults = require('../defaults');
var CanceledError = require('../cancel/CanceledError');

/**
 * Throws a `CanceledError` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }
  if (config.signal && config.signal.aborted) {
    throw new CanceledError();
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
module.exports = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData.call(config, config.data, config.headers, config.transformRequest);

  // Flatten headers
  config.headers = utils.merge(config.headers.common || {}, config.headers[config.method] || {}, config.headers);
  utils.forEach(['delete', 'get', 'head', 'post', 'put', 'patch', 'common'], function cleanHeaderConfig(method) {
    delete config.headers[method];
  });
  var adapter = config.adapter || defaults.adapter;
  return adapter(config).then(function onAdapterResolution(response) {
    throwIfCancellationRequested(config);

    // Transform response data
    response.data = transformData.call(config, response.data, response.headers, config.transformResponse);
    return response;
  }, function onAdapterRejection(reason) {
    if (!isCancel(reason)) {
      throwIfCancellationRequested(config);

      // Transform response data
      if (reason && reason.response) {
        reason.response.data = transformData.call(config, reason.response.data, reason.response.headers, config.transformResponse);
      }
    }
    return Promise.reject(reason);
  });
};
},{"../cancel/CanceledError":5,"../cancel/isCancel":6,"../defaults":15,"./../utils":32,"./transformData":14}],12:[function(require,module,exports){
'use strict';

var utils = require('../utils');

/**
 * Config-specific merge-function which creates a new config-object
 * by merging two configuration objects together.
 *
 * @param {Object} config1
 * @param {Object} config2
 * @returns {Object} New object resulting from merging config2 to config1
 */
module.exports = function mergeConfig(config1, config2) {
  // eslint-disable-next-line no-param-reassign
  config2 = config2 || {};
  var config = {};
  function getMergedValue(target, source) {
    if (utils.isPlainObject(target) && utils.isPlainObject(source)) {
      return utils.merge(target, source);
    } else if (utils.isPlainObject(source)) {
      return utils.merge({}, source);
    } else if (utils.isArray(source)) {
      return source.slice();
    }
    return source;
  }

  // eslint-disable-next-line consistent-return
  function mergeDeepProperties(prop) {
    if (!utils.isUndefined(config2[prop])) {
      return getMergedValue(config1[prop], config2[prop]);
    } else if (!utils.isUndefined(config1[prop])) {
      return getMergedValue(undefined, config1[prop]);
    }
  }

  // eslint-disable-next-line consistent-return
  function valueFromConfig2(prop) {
    if (!utils.isUndefined(config2[prop])) {
      return getMergedValue(undefined, config2[prop]);
    }
  }

  // eslint-disable-next-line consistent-return
  function defaultToConfig2(prop) {
    if (!utils.isUndefined(config2[prop])) {
      return getMergedValue(undefined, config2[prop]);
    } else if (!utils.isUndefined(config1[prop])) {
      return getMergedValue(undefined, config1[prop]);
    }
  }

  // eslint-disable-next-line consistent-return
  function mergeDirectKeys(prop) {
    if (prop in config2) {
      return getMergedValue(config1[prop], config2[prop]);
    } else if (prop in config1) {
      return getMergedValue(undefined, config1[prop]);
    }
  }
  var mergeMap = {
    'url': valueFromConfig2,
    'method': valueFromConfig2,
    'data': valueFromConfig2,
    'baseURL': defaultToConfig2,
    'transformRequest': defaultToConfig2,
    'transformResponse': defaultToConfig2,
    'paramsSerializer': defaultToConfig2,
    'timeout': defaultToConfig2,
    'timeoutMessage': defaultToConfig2,
    'withCredentials': defaultToConfig2,
    'adapter': defaultToConfig2,
    'responseType': defaultToConfig2,
    'xsrfCookieName': defaultToConfig2,
    'xsrfHeaderName': defaultToConfig2,
    'onUploadProgress': defaultToConfig2,
    'onDownloadProgress': defaultToConfig2,
    'decompress': defaultToConfig2,
    'maxContentLength': defaultToConfig2,
    'maxBodyLength': defaultToConfig2,
    'beforeRedirect': defaultToConfig2,
    'transport': defaultToConfig2,
    'httpAgent': defaultToConfig2,
    'httpsAgent': defaultToConfig2,
    'cancelToken': defaultToConfig2,
    'socketPath': defaultToConfig2,
    'responseEncoding': defaultToConfig2,
    'validateStatus': mergeDirectKeys
  };
  utils.forEach(Object.keys(config1).concat(Object.keys(config2)), function computeConfigValue(prop) {
    var merge = mergeMap[prop] || mergeDeepProperties;
    var configValue = merge(prop);
    utils.isUndefined(configValue) && merge !== mergeDirectKeys || (config[prop] = configValue);
  });
  return config;
};
},{"../utils":32}],13:[function(require,module,exports){
'use strict';

var AxiosError = require('./AxiosError');

/**
 * Resolve or reject a Promise based on response status.
 *
 * @param {Function} resolve A function that resolves the promise.
 * @param {Function} reject A function that rejects the promise.
 * @param {object} response The response.
 */
module.exports = function settle(resolve, reject, response) {
  var validateStatus = response.config.validateStatus;
  if (!response.status || !validateStatus || validateStatus(response.status)) {
    resolve(response);
  } else {
    reject(new AxiosError('Request failed with status code ' + response.status, [AxiosError.ERR_BAD_REQUEST, AxiosError.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4], response.config, response.request, response));
  }
};
},{"./AxiosError":8}],14:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
var defaults = require('../defaults');

/**
 * Transform the data for a request or a response
 *
 * @param {Object|String} data The data to be transformed
 * @param {Array} headers The headers for the request or response
 * @param {Array|Function} fns A single function or Array of functions
 * @returns {*} The resulting transformed data
 */
module.exports = function transformData(data, headers, fns) {
  var context = this || defaults;
  /*eslint no-param-reassign:0*/
  utils.forEach(fns, function transform(fn) {
    data = fn.call(context, data, headers);
  });
  return data;
};
},{"../defaults":15,"./../utils":32}],15:[function(require,module,exports){
(function (process){(function (){
'use strict';

var utils = require('../utils');
var normalizeHeaderName = require('../helpers/normalizeHeaderName');
var AxiosError = require('../core/AxiosError');
var transitionalDefaults = require('./transitional');
var toFormData = require('../helpers/toFormData');
var DEFAULT_CONTENT_TYPE = {
  'Content-Type': 'application/x-www-form-urlencoded'
};
function setContentTypeIfUnset(headers, value) {
  if (!utils.isUndefined(headers) && utils.isUndefined(headers['Content-Type'])) {
    headers['Content-Type'] = value;
  }
}
function getDefaultAdapter() {
  var adapter;
  if (typeof XMLHttpRequest !== 'undefined') {
    // For browsers use XHR adapter
    adapter = require('../adapters/xhr');
  } else if (typeof process !== 'undefined' && Object.prototype.toString.call(process) === '[object process]') {
    // For node use HTTP adapter
    adapter = require('../adapters/http');
  }
  return adapter;
}
function stringifySafely(rawValue, parser, encoder) {
  if (utils.isString(rawValue)) {
    try {
      (parser || JSON.parse)(rawValue);
      return utils.trim(rawValue);
    } catch (e) {
      if (e.name !== 'SyntaxError') {
        throw e;
      }
    }
  }
  return (encoder || JSON.stringify)(rawValue);
}
var defaults = {
  transitional: transitionalDefaults,
  adapter: getDefaultAdapter(),
  transformRequest: [function transformRequest(data, headers) {
    normalizeHeaderName(headers, 'Accept');
    normalizeHeaderName(headers, 'Content-Type');
    if (utils.isFormData(data) || utils.isArrayBuffer(data) || utils.isBuffer(data) || utils.isStream(data) || utils.isFile(data) || utils.isBlob(data)) {
      return data;
    }
    if (utils.isArrayBufferView(data)) {
      return data.buffer;
    }
    if (utils.isURLSearchParams(data)) {
      setContentTypeIfUnset(headers, 'application/x-www-form-urlencoded;charset=utf-8');
      return data.toString();
    }
    var isObjectPayload = utils.isObject(data);
    var contentType = headers && headers['Content-Type'];
    var isFileList;
    if ((isFileList = utils.isFileList(data)) || isObjectPayload && contentType === 'multipart/form-data') {
      var _FormData = this.env && this.env.FormData;
      return toFormData(isFileList ? {
        'files[]': data
      } : data, _FormData && new _FormData());
    } else if (isObjectPayload || contentType === 'application/json') {
      setContentTypeIfUnset(headers, 'application/json');
      return stringifySafely(data);
    }
    return data;
  }],
  transformResponse: [function transformResponse(data) {
    var transitional = this.transitional || defaults.transitional;
    var silentJSONParsing = transitional && transitional.silentJSONParsing;
    var forcedJSONParsing = transitional && transitional.forcedJSONParsing;
    var strictJSONParsing = !silentJSONParsing && this.responseType === 'json';
    if (strictJSONParsing || forcedJSONParsing && utils.isString(data) && data.length) {
      try {
        return JSON.parse(data);
      } catch (e) {
        if (strictJSONParsing) {
          if (e.name === 'SyntaxError') {
            throw AxiosError.from(e, AxiosError.ERR_BAD_RESPONSE, this, null, this.response);
          }
          throw e;
        }
      }
    }
    return data;
  }],
  /**
   * A timeout in milliseconds to abort a request. If set to 0 (default) a
   * timeout is not created.
   */
  timeout: 0,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  maxContentLength: -1,
  maxBodyLength: -1,
  env: {
    FormData: require('./env/FormData')
  },
  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  },
  headers: {
    common: {
      'Accept': 'application/json, text/plain, */*'
    }
  }
};
utils.forEach(['delete', 'get', 'head'], function forEachMethodNoData(method) {
  defaults.headers[method] = {};
});
utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  defaults.headers[method] = utils.merge(DEFAULT_CONTENT_TYPE);
});
module.exports = defaults;
}).call(this)}).call(this,require('_process'))
},{"../adapters/http":2,"../adapters/xhr":2,"../core/AxiosError":8,"../helpers/normalizeHeaderName":25,"../helpers/toFormData":30,"../utils":32,"./env/FormData":26,"./transitional":16,"_process":67}],16:[function(require,module,exports){
'use strict';

module.exports = {
  silentJSONParsing: true,
  forcedJSONParsing: true,
  clarifyTimeoutError: false
};
},{}],17:[function(require,module,exports){
"use strict";

module.exports = {
  "version": "0.27.2"
};
},{}],18:[function(require,module,exports){
'use strict';

module.exports = function bind(fn, thisArg) {
  return function wrap() {
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }
    return fn.apply(thisArg, args);
  };
};
},{}],19:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
function encode(val) {
  return encodeURIComponent(val).replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%20/g, '+').replace(/%5B/gi, '[').replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
module.exports = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  if (!params) {
    return url;
  }
  var serializedParams;
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
  } else if (utils.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];
    utils.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }
      if (utils.isArray(val)) {
        key = key + '[]';
      } else {
        val = [val];
      }
      utils.forEach(val, function parseValue(v) {
        if (utils.isDate(v)) {
          v = v.toISOString();
        } else if (utils.isObject(v)) {
          v = JSON.stringify(v);
        }
        parts.push(encode(key) + '=' + encode(v));
      });
    });
    serializedParams = parts.join('&');
  }
  if (serializedParams) {
    var hashmarkIndex = url.indexOf('#');
    if (hashmarkIndex !== -1) {
      url = url.slice(0, hashmarkIndex);
    }
    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }
  return url;
};
},{"./../utils":32}],20:[function(require,module,exports){
'use strict';

/**
 * Creates a new URL by combining the specified URLs
 *
 * @param {string} baseURL The base URL
 * @param {string} relativeURL The relative URL
 * @returns {string} The combined URL
 */
module.exports = function combineURLs(baseURL, relativeURL) {
  return relativeURL ? baseURL.replace(/\/+$/, '') + '/' + relativeURL.replace(/^\/+/, '') : baseURL;
};
},{}],21:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
module.exports = utils.isStandardBrowserEnv() ?
// Standard browser envs support document.cookie
function standardBrowserEnv() {
  return {
    write: function write(name, value, expires, path, domain, secure) {
      var cookie = [];
      cookie.push(name + '=' + encodeURIComponent(value));
      if (utils.isNumber(expires)) {
        cookie.push('expires=' + new Date(expires).toGMTString());
      }
      if (utils.isString(path)) {
        cookie.push('path=' + path);
      }
      if (utils.isString(domain)) {
        cookie.push('domain=' + domain);
      }
      if (secure === true) {
        cookie.push('secure');
      }
      document.cookie = cookie.join('; ');
    },
    read: function read(name) {
      var match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
      return match ? decodeURIComponent(match[3]) : null;
    },
    remove: function remove(name) {
      this.write(name, '', Date.now() - 86400000);
    }
  };
}() :
// Non standard browser env (web workers, react-native) lack needed support.
function nonStandardBrowserEnv() {
  return {
    write: function write() {},
    read: function read() {
      return null;
    },
    remove: function remove() {}
  };
}();
},{"./../utils":32}],22:[function(require,module,exports){
'use strict';

/**
 * Determines whether the specified URL is absolute
 *
 * @param {string} url The URL to test
 * @returns {boolean} True if the specified URL is absolute, otherwise false
 */
module.exports = function isAbsoluteURL(url) {
  // A URL is considered absolute if it begins with "<scheme>://" or "//" (protocol-relative URL).
  // RFC 3986 defines scheme name as a sequence of characters beginning with a letter and followed
  // by any combination of letters, digits, plus, period, or hyphen.
  return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
};
},{}],23:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

/**
 * Determines whether the payload is an error thrown by Axios
 *
 * @param {*} payload The value to test
 * @returns {boolean} True if the payload is an error thrown by Axios, otherwise false
 */
module.exports = function isAxiosError(payload) {
  return utils.isObject(payload) && payload.isAxiosError === true;
};
},{"./../utils":32}],24:[function(require,module,exports){
'use strict';

var utils = require('./../utils');
module.exports = utils.isStandardBrowserEnv() ?
// Standard browser envs have full support of the APIs needed to test
// whether the request URL is of the same origin as current location.
function standardBrowserEnv() {
  var msie = /(msie|trident)/i.test(navigator.userAgent);
  var urlParsingNode = document.createElement('a');
  var originURL;

  /**
  * Parse a URL to discover it's components
  *
  * @param {String} url The URL to be parsed
  * @returns {Object}
  */
  function resolveURL(url) {
    var href = url;
    if (msie) {
      // IE needs attribute set twice to normalize properties
      urlParsingNode.setAttribute('href', href);
      href = urlParsingNode.href;
    }
    urlParsingNode.setAttribute('href', href);

    // urlParsingNode provides the UrlUtils interface - http://url.spec.whatwg.org/#urlutils
    return {
      href: urlParsingNode.href,
      protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
      host: urlParsingNode.host,
      search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
      hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
      hostname: urlParsingNode.hostname,
      port: urlParsingNode.port,
      pathname: urlParsingNode.pathname.charAt(0) === '/' ? urlParsingNode.pathname : '/' + urlParsingNode.pathname
    };
  }
  originURL = resolveURL(window.location.href);

  /**
  * Determine if a URL shares the same origin as the current location
  *
  * @param {String} requestURL The URL to test
  * @returns {boolean} True if URL shares the same origin, otherwise false
  */
  return function isURLSameOrigin(requestURL) {
    var parsed = utils.isString(requestURL) ? resolveURL(requestURL) : requestURL;
    return parsed.protocol === originURL.protocol && parsed.host === originURL.host;
  };
}() :
// Non standard browser envs (web workers, react-native) lack needed support.
function nonStandardBrowserEnv() {
  return function isURLSameOrigin() {
    return true;
  };
}();
},{"./../utils":32}],25:[function(require,module,exports){
'use strict';

var utils = require('../utils');
module.exports = function normalizeHeaderName(headers, normalizedName) {
  utils.forEach(headers, function processHeader(value, name) {
    if (name !== normalizedName && name.toUpperCase() === normalizedName.toUpperCase()) {
      headers[normalizedName] = value;
      delete headers[name];
    }
  });
};
},{"../utils":32}],26:[function(require,module,exports){
"use strict";

// eslint-disable-next-line strict
module.exports = null;
},{}],27:[function(require,module,exports){
'use strict';

var utils = require('./../utils');

// Headers whose duplicates are ignored by node
// c.f. https://nodejs.org/api/http.html#http_message_headers
var ignoreDuplicateOf = ['age', 'authorization', 'content-length', 'content-type', 'etag', 'expires', 'from', 'host', 'if-modified-since', 'if-unmodified-since', 'last-modified', 'location', 'max-forwards', 'proxy-authorization', 'referer', 'retry-after', 'user-agent'];

/**
 * Parse headers into an object
 *
 * ```
 * Date: Wed, 27 Aug 2014 08:58:49 GMT
 * Content-Type: application/json
 * Connection: keep-alive
 * Transfer-Encoding: chunked
 * ```
 *
 * @param {String} headers Headers needing to be parsed
 * @returns {Object} Headers parsed into an object
 */
module.exports = function parseHeaders(headers) {
  var parsed = {};
  var key;
  var val;
  var i;
  if (!headers) {
    return parsed;
  }
  utils.forEach(headers.split('\n'), function parser(line) {
    i = line.indexOf(':');
    key = utils.trim(line.substr(0, i)).toLowerCase();
    val = utils.trim(line.substr(i + 1));
    if (key) {
      if (parsed[key] && ignoreDuplicateOf.indexOf(key) >= 0) {
        return;
      }
      if (key === 'set-cookie') {
        parsed[key] = (parsed[key] ? parsed[key] : []).concat([val]);
      } else {
        parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
      }
    }
  });
  return parsed;
};
},{"./../utils":32}],28:[function(require,module,exports){
'use strict';

module.exports = function parseProtocol(url) {
  var match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url);
  return match && match[1] || '';
};
},{}],29:[function(require,module,exports){
'use strict';

/**
 * Syntactic sugar for invoking a function and expanding an array for arguments.
 *
 * Common use case would be to use `Function.prototype.apply`.
 *
 *  ```js
 *  function f(x, y, z) {}
 *  var args = [1, 2, 3];
 *  f.apply(null, args);
 *  ```
 *
 * With `spread` this example can be re-written.
 *
 *  ```js
 *  spread(function(x, y, z) {})([1, 2, 3]);
 *  ```
 *
 * @param {Function} callback
 * @returns {Function}
 */
module.exports = function spread(callback) {
  return function wrap(arr) {
    return callback.apply(null, arr);
  };
};
},{}],30:[function(require,module,exports){
(function (Buffer){(function (){
'use strict';

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
var utils = require('../utils');

/**
 * Convert a data object to FormData
 * @param {Object} obj
 * @param {?Object} [formData]
 * @returns {Object}
 **/

function toFormData(obj, formData) {
  // eslint-disable-next-line no-param-reassign
  formData = formData || new FormData();
  var stack = [];
  function convertValue(value) {
    if (value === null) return '';
    if (utils.isDate(value)) {
      return value.toISOString();
    }
    if (utils.isArrayBuffer(value) || utils.isTypedArray(value)) {
      return typeof Blob === 'function' ? new Blob([value]) : Buffer.from(value);
    }
    return value;
  }
  function build(data, parentKey) {
    if (utils.isPlainObject(data) || utils.isArray(data)) {
      if (stack.indexOf(data) !== -1) {
        throw Error('Circular reference detected in ' + parentKey);
      }
      stack.push(data);
      utils.forEach(data, function each(value, key) {
        if (utils.isUndefined(value)) return;
        var fullKey = parentKey ? parentKey + '.' + key : key;
        var arr;
        if (value && !parentKey && _typeof(value) === 'object') {
          if (utils.endsWith(key, '{}')) {
            // eslint-disable-next-line no-param-reassign
            value = JSON.stringify(value);
          } else if (utils.endsWith(key, '[]') && (arr = utils.toArray(value))) {
            // eslint-disable-next-line func-names
            arr.forEach(function (el) {
              !utils.isUndefined(el) && formData.append(fullKey, convertValue(el));
            });
            return;
          }
        }
        build(value, fullKey);
      });
      stack.pop();
    } else {
      formData.append(parentKey, convertValue(data));
    }
  }
  build(obj);
  return formData;
}
module.exports = toFormData;
}).call(this)}).call(this,require("buffer").Buffer)
},{"../utils":32,"buffer":34}],31:[function(require,module,exports){
'use strict';

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
var VERSION = require('../env/data').version;
var AxiosError = require('../core/AxiosError');
var validators = {};

// eslint-disable-next-line func-names
['object', 'boolean', 'number', 'function', 'string', 'symbol'].forEach(function (type, i) {
  validators[type] = function validator(thing) {
    return _typeof(thing) === type || 'a' + (i < 1 ? 'n ' : ' ') + type;
  };
});
var deprecatedWarnings = {};

/**
 * Transitional option validator
 * @param {function|boolean?} validator - set to false if the transitional option has been removed
 * @param {string?} version - deprecated version / removed since version
 * @param {string?} message - some message with additional info
 * @returns {function}
 */
validators.transitional = function transitional(validator, version, message) {
  function formatMessage(opt, desc) {
    return '[Axios v' + VERSION + '] Transitional option \'' + opt + '\'' + desc + (message ? '. ' + message : '');
  }

  // eslint-disable-next-line func-names
  return function (value, opt, opts) {
    if (validator === false) {
      throw new AxiosError(formatMessage(opt, ' has been removed' + (version ? ' in ' + version : '')), AxiosError.ERR_DEPRECATED);
    }
    if (version && !deprecatedWarnings[opt]) {
      deprecatedWarnings[opt] = true;
      // eslint-disable-next-line no-console
      console.warn(formatMessage(opt, ' has been deprecated since v' + version + ' and will be removed in the near future'));
    }
    return validator ? validator(value, opt, opts) : true;
  };
};

/**
 * Assert object's properties type
 * @param {object} options
 * @param {object} schema
 * @param {boolean?} allowUnknown
 */

function assertOptions(options, schema, allowUnknown) {
  if (_typeof(options) !== 'object') {
    throw new AxiosError('options must be an object', AxiosError.ERR_BAD_OPTION_VALUE);
  }
  var keys = Object.keys(options);
  var i = keys.length;
  while (i-- > 0) {
    var opt = keys[i];
    var validator = schema[opt];
    if (validator) {
      var value = options[opt];
      var result = value === undefined || validator(value, opt, options);
      if (result !== true) {
        throw new AxiosError('option ' + opt + ' must be ' + result, AxiosError.ERR_BAD_OPTION_VALUE);
      }
      continue;
    }
    if (allowUnknown !== true) {
      throw new AxiosError('Unknown option ' + opt, AxiosError.ERR_BAD_OPTION);
    }
  }
}
module.exports = {
  assertOptions: assertOptions,
  validators: validators
};
},{"../core/AxiosError":8,"../env/data":17}],32:[function(require,module,exports){
'use strict';

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
var bind = require('./helpers/bind');

// utils is a library of generic helper functions non-specific to axios

var toString = Object.prototype.toString;

// eslint-disable-next-line func-names
var kindOf = function (cache) {
  // eslint-disable-next-line func-names
  return function (thing) {
    var str = toString.call(thing);
    return cache[str] || (cache[str] = str.slice(8, -1).toLowerCase());
  };
}(Object.create(null));
function kindOfTest(type) {
  type = type.toLowerCase();
  return function isKindOf(thing) {
    return kindOf(thing) === type;
  };
}

/**
 * Determine if a value is an Array
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Array, otherwise false
 */
function isArray(val) {
  return Array.isArray(val);
}

/**
 * Determine if a value is undefined
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if the value is undefined, otherwise false
 */
function isUndefined(val) {
  return typeof val === 'undefined';
}

/**
 * Determine if a value is a Buffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Buffer, otherwise false
 */
function isBuffer(val) {
  return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && typeof val.constructor.isBuffer === 'function' && val.constructor.isBuffer(val);
}

/**
 * Determine if a value is an ArrayBuffer
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an ArrayBuffer, otherwise false
 */
var isArrayBuffer = kindOfTest('ArrayBuffer');

/**
 * Determine if a value is a view on an ArrayBuffer
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a view on an ArrayBuffer, otherwise false
 */
function isArrayBufferView(val) {
  var result;
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView) {
    result = ArrayBuffer.isView(val);
  } else {
    result = val && val.buffer && isArrayBuffer(val.buffer);
  }
  return result;
}

/**
 * Determine if a value is a String
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a String, otherwise false
 */
function isString(val) {
  return typeof val === 'string';
}

/**
 * Determine if a value is a Number
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Number, otherwise false
 */
function isNumber(val) {
  return typeof val === 'number';
}

/**
 * Determine if a value is an Object
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is an Object, otherwise false
 */
function isObject(val) {
  return val !== null && _typeof(val) === 'object';
}

/**
 * Determine if a value is a plain Object
 *
 * @param {Object} val The value to test
 * @return {boolean} True if value is a plain Object, otherwise false
 */
function isPlainObject(val) {
  if (kindOf(val) !== 'object') {
    return false;
  }
  var prototype = Object.getPrototypeOf(val);
  return prototype === null || prototype === Object.prototype;
}

/**
 * Determine if a value is a Date
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Date, otherwise false
 */
var isDate = kindOfTest('Date');

/**
 * Determine if a value is a File
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
var isFile = kindOfTest('File');

/**
 * Determine if a value is a Blob
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Blob, otherwise false
 */
var isBlob = kindOfTest('Blob');

/**
 * Determine if a value is a FileList
 *
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a File, otherwise false
 */
var isFileList = kindOfTest('FileList');

/**
 * Determine if a value is a Function
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Function, otherwise false
 */
function isFunction(val) {
  return toString.call(val) === '[object Function]';
}

/**
 * Determine if a value is a Stream
 *
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a Stream, otherwise false
 */
function isStream(val) {
  return isObject(val) && isFunction(val.pipe);
}

/**
 * Determine if a value is a FormData
 *
 * @param {Object} thing The value to test
 * @returns {boolean} True if value is an FormData, otherwise false
 */
function isFormData(thing) {
  var pattern = '[object FormData]';
  return thing && (typeof FormData === 'function' && thing instanceof FormData || toString.call(thing) === pattern || isFunction(thing.toString) && thing.toString() === pattern);
}

/**
 * Determine if a value is a URLSearchParams object
 * @function
 * @param {Object} val The value to test
 * @returns {boolean} True if value is a URLSearchParams object, otherwise false
 */
var isURLSearchParams = kindOfTest('URLSearchParams');

/**
 * Trim excess whitespace off the beginning and end of a string
 *
 * @param {String} str The String to trim
 * @returns {String} The String freed of excess whitespace
 */
function trim(str) {
  return str.trim ? str.trim() : str.replace(/^\s+|\s+$/g, '');
}

/**
 * Determine if we're running in a standard browser environment
 *
 * This allows axios to run in a web worker, and react-native.
 * Both environments support XMLHttpRequest, but not fully standard globals.
 *
 * web workers:
 *  typeof window -> undefined
 *  typeof document -> undefined
 *
 * react-native:
 *  navigator.product -> 'ReactNative'
 * nativescript
 *  navigator.product -> 'NativeScript' or 'NS'
 */
function isStandardBrowserEnv() {
  if (typeof navigator !== 'undefined' && (navigator.product === 'ReactNative' || navigator.product === 'NativeScript' || navigator.product === 'NS')) {
    return false;
  }
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

/**
 * Iterate over an Array or an Object invoking a function for each item.
 *
 * If `obj` is an Array callback will be called passing
 * the value, index, and complete array for each item.
 *
 * If 'obj' is an Object callback will be called passing
 * the value, key, and complete object for each property.
 *
 * @param {Object|Array} obj The object to iterate
 * @param {Function} fn The callback to invoke for each item
 */
function forEach(obj, fn) {
  // Don't bother if no value provided
  if (obj === null || typeof obj === 'undefined') {
    return;
  }

  // Force an array if not already something iterable
  if (_typeof(obj) !== 'object') {
    /*eslint no-param-reassign:0*/
    obj = [obj];
  }
  if (isArray(obj)) {
    // Iterate over array values
    for (var i = 0, l = obj.length; i < l; i++) {
      fn.call(null, obj[i], i, obj);
    }
  } else {
    // Iterate over object keys
    for (var key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        fn.call(null, obj[key], key, obj);
      }
    }
  }
}

/**
 * Accepts varargs expecting each argument to be an object, then
 * immutably merges the properties of each object and returns result.
 *
 * When multiple objects contain the same key the later object in
 * the arguments list will take precedence.
 *
 * Example:
 *
 * ```js
 * var result = merge({foo: 123}, {foo: 456});
 * console.log(result.foo); // outputs 456
 * ```
 *
 * @param {Object} obj1 Object to merge
 * @returns {Object} Result of all merge properties
 */
function merge( /* obj1, obj2, obj3, ... */
) {
  var result = {};
  function assignValue(val, key) {
    if (isPlainObject(result[key]) && isPlainObject(val)) {
      result[key] = merge(result[key], val);
    } else if (isPlainObject(val)) {
      result[key] = merge({}, val);
    } else if (isArray(val)) {
      result[key] = val.slice();
    } else {
      result[key] = val;
    }
  }
  for (var i = 0, l = arguments.length; i < l; i++) {
    forEach(arguments[i], assignValue);
  }
  return result;
}

/**
 * Extends object a by mutably adding to it the properties of object b.
 *
 * @param {Object} a The object to be extended
 * @param {Object} b The object to copy properties from
 * @param {Object} thisArg The object to bind function to
 * @return {Object} The resulting value of object a
 */
function extend(a, b, thisArg) {
  forEach(b, function assignValue(val, key) {
    if (thisArg && typeof val === 'function') {
      a[key] = bind(val, thisArg);
    } else {
      a[key] = val;
    }
  });
  return a;
}

/**
 * Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
 *
 * @param {string} content with BOM
 * @return {string} content value without BOM
 */
function stripBOM(content) {
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1);
  }
  return content;
}

/**
 * Inherit the prototype methods from one constructor into another
 * @param {function} constructor
 * @param {function} superConstructor
 * @param {object} [props]
 * @param {object} [descriptors]
 */

function inherits(constructor, superConstructor, props, descriptors) {
  constructor.prototype = Object.create(superConstructor.prototype, descriptors);
  constructor.prototype.constructor = constructor;
  props && Object.assign(constructor.prototype, props);
}

/**
 * Resolve object with deep prototype chain to a flat object
 * @param {Object} sourceObj source object
 * @param {Object} [destObj]
 * @param {Function} [filter]
 * @returns {Object}
 */

function toFlatObject(sourceObj, destObj, filter) {
  var props;
  var i;
  var prop;
  var merged = {};
  destObj = destObj || {};
  do {
    props = Object.getOwnPropertyNames(sourceObj);
    i = props.length;
    while (i-- > 0) {
      prop = props[i];
      if (!merged[prop]) {
        destObj[prop] = sourceObj[prop];
        merged[prop] = true;
      }
    }
    sourceObj = Object.getPrototypeOf(sourceObj);
  } while (sourceObj && (!filter || filter(sourceObj, destObj)) && sourceObj !== Object.prototype);
  return destObj;
}

/*
 * determines whether a string ends with the characters of a specified string
 * @param {String} str
 * @param {String} searchString
 * @param {Number} [position= 0]
 * @returns {boolean}
 */
function endsWith(str, searchString, position) {
  str = String(str);
  if (position === undefined || position > str.length) {
    position = str.length;
  }
  position -= searchString.length;
  var lastIndex = str.indexOf(searchString, position);
  return lastIndex !== -1 && lastIndex === position;
}

/**
 * Returns new array from array like object
 * @param {*} [thing]
 * @returns {Array}
 */
function toArray(thing) {
  if (!thing) return null;
  var i = thing.length;
  if (isUndefined(i)) return null;
  var arr = new Array(i);
  while (i-- > 0) {
    arr[i] = thing[i];
  }
  return arr;
}

// eslint-disable-next-line func-names
var isTypedArray = function (TypedArray) {
  // eslint-disable-next-line func-names
  return function (thing) {
    return TypedArray && thing instanceof TypedArray;
  };
}(typeof Uint8Array !== 'undefined' && Object.getPrototypeOf(Uint8Array));
module.exports = {
  isArray: isArray,
  isArrayBuffer: isArrayBuffer,
  isBuffer: isBuffer,
  isFormData: isFormData,
  isArrayBufferView: isArrayBufferView,
  isString: isString,
  isNumber: isNumber,
  isObject: isObject,
  isPlainObject: isPlainObject,
  isUndefined: isUndefined,
  isDate: isDate,
  isFile: isFile,
  isBlob: isBlob,
  isFunction: isFunction,
  isStream: isStream,
  isURLSearchParams: isURLSearchParams,
  isStandardBrowserEnv: isStandardBrowserEnv,
  forEach: forEach,
  merge: merge,
  extend: extend,
  trim: trim,
  stripBOM: stripBOM,
  inherits: inherits,
  toFlatObject: toFlatObject,
  kindOf: kindOf,
  kindOfTest: kindOfTest,
  endsWith: endsWith,
  toArray: toArray,
  isTypedArray: isTypedArray,
  isFileList: isFileList
};
},{"./helpers/bind":18}],33:[function(require,module,exports){
'use strict';

exports.byteLength = byteLength;
exports.toByteArray = toByteArray;
exports.fromByteArray = fromByteArray;
var lookup = [];
var revLookup = [];
var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array;
var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
for (var i = 0, len = code.length; i < len; ++i) {
  lookup[i] = code[i];
  revLookup[code.charCodeAt(i)] = i;
}

// Support decoding URL-safe base64 strings, as Node.js does.
// See: https://en.wikipedia.org/wiki/Base64#URL_applications
revLookup['-'.charCodeAt(0)] = 62;
revLookup['_'.charCodeAt(0)] = 63;
function getLens(b64) {
  var len = b64.length;
  if (len % 4 > 0) {
    throw new Error('Invalid string. Length must be a multiple of 4');
  }

  // Trim off extra bytes after placeholder bytes are found
  // See: https://github.com/beatgammit/base64-js/issues/42
  var validLen = b64.indexOf('=');
  if (validLen === -1) validLen = len;
  var placeHoldersLen = validLen === len ? 0 : 4 - validLen % 4;
  return [validLen, placeHoldersLen];
}

// base64 is 4/3 + up to two characters of the original data
function byteLength(b64) {
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}
function _byteLength(b64, validLen, placeHoldersLen) {
  return (validLen + placeHoldersLen) * 3 / 4 - placeHoldersLen;
}
function toByteArray(b64) {
  var tmp;
  var lens = getLens(b64);
  var validLen = lens[0];
  var placeHoldersLen = lens[1];
  var arr = new Arr(_byteLength(b64, validLen, placeHoldersLen));
  var curByte = 0;

  // if there are placeholders, only get up to the last complete 4 chars
  var len = placeHoldersLen > 0 ? validLen - 4 : validLen;
  var i;
  for (i = 0; i < len; i += 4) {
    tmp = revLookup[b64.charCodeAt(i)] << 18 | revLookup[b64.charCodeAt(i + 1)] << 12 | revLookup[b64.charCodeAt(i + 2)] << 6 | revLookup[b64.charCodeAt(i + 3)];
    arr[curByte++] = tmp >> 16 & 0xFF;
    arr[curByte++] = tmp >> 8 & 0xFF;
    arr[curByte++] = tmp & 0xFF;
  }
  if (placeHoldersLen === 2) {
    tmp = revLookup[b64.charCodeAt(i)] << 2 | revLookup[b64.charCodeAt(i + 1)] >> 4;
    arr[curByte++] = tmp & 0xFF;
  }
  if (placeHoldersLen === 1) {
    tmp = revLookup[b64.charCodeAt(i)] << 10 | revLookup[b64.charCodeAt(i + 1)] << 4 | revLookup[b64.charCodeAt(i + 2)] >> 2;
    arr[curByte++] = tmp >> 8 & 0xFF;
    arr[curByte++] = tmp & 0xFF;
  }
  return arr;
}
function tripletToBase64(num) {
  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F];
}
function encodeChunk(uint8, start, end) {
  var tmp;
  var output = [];
  for (var i = start; i < end; i += 3) {
    tmp = (uint8[i] << 16 & 0xFF0000) + (uint8[i + 1] << 8 & 0xFF00) + (uint8[i + 2] & 0xFF);
    output.push(tripletToBase64(tmp));
  }
  return output.join('');
}
function fromByteArray(uint8) {
  var tmp;
  var len = uint8.length;
  var extraBytes = len % 3; // if we have 1 byte left, pad 2 bytes
  var parts = [];
  var maxChunkLength = 16383; // must be multiple of 3

  // go through the array every three bytes, we'll deal with trailing stuff later
  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {
    parts.push(encodeChunk(uint8, i, i + maxChunkLength > len2 ? len2 : i + maxChunkLength));
  }

  // pad the end with zeros, but make sure to not forget the extra bytes
  if (extraBytes === 1) {
    tmp = uint8[len - 1];
    parts.push(lookup[tmp >> 2] + lookup[tmp << 4 & 0x3F] + '==');
  } else if (extraBytes === 2) {
    tmp = (uint8[len - 2] << 8) + uint8[len - 1];
    parts.push(lookup[tmp >> 10] + lookup[tmp >> 4 & 0x3F] + lookup[tmp << 2 & 0x3F] + '=');
  }
  return parts.join('');
}
},{}],34:[function(require,module,exports){
(function (Buffer){(function (){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
/* eslint-disable no-proto */

'use strict';

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
var base64 = require('base64-js');
var ieee754 = require('ieee754');
exports.Buffer = Buffer;
exports.SlowBuffer = SlowBuffer;
exports.INSPECT_MAX_BYTES = 50;
var K_MAX_LENGTH = 0x7fffffff;
exports.kMaxLength = K_MAX_LENGTH;

/**
 * If `Buffer.TYPED_ARRAY_SUPPORT`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Print warning and recommend using `buffer` v4.x which has an Object
 *               implementation (most compatible, even IE6)
 *
 * Browsers that support typed arrays are IE 10+, Firefox 4+, Chrome 7+, Safari 5.1+,
 * Opera 11.6+, iOS 4.2+.
 *
 * We report that the browser does not support typed arrays if the are not subclassable
 * using __proto__. Firefox 4-29 lacks support for adding new properties to `Uint8Array`
 * (See: https://bugzilla.mozilla.org/show_bug.cgi?id=695438). IE 10 lacks support
 * for __proto__ and has a buggy typed array implementation.
 */
Buffer.TYPED_ARRAY_SUPPORT = typedArraySupport();
if (!Buffer.TYPED_ARRAY_SUPPORT && typeof console !== 'undefined' && typeof console.error === 'function') {
  console.error('This browser lacks typed array (Uint8Array) support which is required by ' + '`buffer` v5.x. Use `buffer` v4.x if you require old browser support.');
}
function typedArraySupport() {
  // Can typed array instances can be augmented?
  try {
    var arr = new Uint8Array(1);
    arr.__proto__ = {
      __proto__: Uint8Array.prototype,
      foo: function foo() {
        return 42;
      }
    };
    return arr.foo() === 42;
  } catch (e) {
    return false;
  }
}
Object.defineProperty(Buffer.prototype, 'parent', {
  enumerable: true,
  get: function get() {
    if (!Buffer.isBuffer(this)) return undefined;
    return this.buffer;
  }
});
Object.defineProperty(Buffer.prototype, 'offset', {
  enumerable: true,
  get: function get() {
    if (!Buffer.isBuffer(this)) return undefined;
    return this.byteOffset;
  }
});
function createBuffer(length) {
  if (length > K_MAX_LENGTH) {
    throw new RangeError('The value "' + length + '" is invalid for option "size"');
  }
  // Return an augmented `Uint8Array` instance
  var buf = new Uint8Array(length);
  buf.__proto__ = Buffer.prototype;
  return buf;
}

/**
 * The Buffer constructor returns instances of `Uint8Array` that have their
 * prototype changed to `Buffer.prototype`. Furthermore, `Buffer` is a subclass of
 * `Uint8Array`, so the returned instances will have all the node `Buffer` methods
 * and the `Uint8Array` methods. Square bracket notation works as expected -- it
 * returns a single octet.
 *
 * The `Uint8Array` prototype remains unmodified.
 */

function Buffer(arg, encodingOrOffset, length) {
  // Common case.
  if (typeof arg === 'number') {
    if (typeof encodingOrOffset === 'string') {
      throw new TypeError('The "string" argument must be of type string. Received type number');
    }
    return allocUnsafe(arg);
  }
  return from(arg, encodingOrOffset, length);
}

// Fix subarray() in ES2016. See: https://github.com/feross/buffer/pull/97
if (typeof Symbol !== 'undefined' && Symbol.species != null && Buffer[Symbol.species] === Buffer) {
  Object.defineProperty(Buffer, Symbol.species, {
    value: null,
    configurable: true,
    enumerable: false,
    writable: false
  });
}
Buffer.poolSize = 8192; // not used by this implementation

function from(value, encodingOrOffset, length) {
  if (typeof value === 'string') {
    return fromString(value, encodingOrOffset);
  }
  if (ArrayBuffer.isView(value)) {
    return fromArrayLike(value);
  }
  if (value == null) {
    throw TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' + 'or Array-like Object. Received type ' + _typeof(value));
  }
  if (isInstance(value, ArrayBuffer) || value && isInstance(value.buffer, ArrayBuffer)) {
    return fromArrayBuffer(value, encodingOrOffset, length);
  }
  if (typeof value === 'number') {
    throw new TypeError('The "value" argument must not be of type number. Received type number');
  }
  var valueOf = value.valueOf && value.valueOf();
  if (valueOf != null && valueOf !== value) {
    return Buffer.from(valueOf, encodingOrOffset, length);
  }
  var b = fromObject(value);
  if (b) return b;
  if (typeof Symbol !== 'undefined' && Symbol.toPrimitive != null && typeof value[Symbol.toPrimitive] === 'function') {
    return Buffer.from(value[Symbol.toPrimitive]('string'), encodingOrOffset, length);
  }
  throw new TypeError('The first argument must be one of type string, Buffer, ArrayBuffer, Array, ' + 'or Array-like Object. Received type ' + _typeof(value));
}

/**
 * Functionally equivalent to Buffer(arg, encoding) but throws a TypeError
 * if value is a number.
 * Buffer.from(str[, encoding])
 * Buffer.from(array)
 * Buffer.from(buffer)
 * Buffer.from(arrayBuffer[, byteOffset[, length]])
 **/
Buffer.from = function (value, encodingOrOffset, length) {
  return from(value, encodingOrOffset, length);
};

// Note: Change prototype *after* Buffer.from is defined to workaround Chrome bug:
// https://github.com/feross/buffer/pull/148
Buffer.prototype.__proto__ = Uint8Array.prototype;
Buffer.__proto__ = Uint8Array;
function assertSize(size) {
  if (typeof size !== 'number') {
    throw new TypeError('"size" argument must be of type number');
  } else if (size < 0) {
    throw new RangeError('The value "' + size + '" is invalid for option "size"');
  }
}
function alloc(size, fill, encoding) {
  assertSize(size);
  if (size <= 0) {
    return createBuffer(size);
  }
  if (fill !== undefined) {
    // Only pay attention to encoding if it's a string. This
    // prevents accidentally sending in a number that would
    // be interpretted as a start offset.
    return typeof encoding === 'string' ? createBuffer(size).fill(fill, encoding) : createBuffer(size).fill(fill);
  }
  return createBuffer(size);
}

/**
 * Creates a new filled Buffer instance.
 * alloc(size[, fill[, encoding]])
 **/
Buffer.alloc = function (size, fill, encoding) {
  return alloc(size, fill, encoding);
};
function allocUnsafe(size) {
  assertSize(size);
  return createBuffer(size < 0 ? 0 : checked(size) | 0);
}

/**
 * Equivalent to Buffer(num), by default creates a non-zero-filled Buffer instance.
 * */
Buffer.allocUnsafe = function (size) {
  return allocUnsafe(size);
};
/**
 * Equivalent to SlowBuffer(num), by default creates a non-zero-filled Buffer instance.
 */
Buffer.allocUnsafeSlow = function (size) {
  return allocUnsafe(size);
};
function fromString(string, encoding) {
  if (typeof encoding !== 'string' || encoding === '') {
    encoding = 'utf8';
  }
  if (!Buffer.isEncoding(encoding)) {
    throw new TypeError('Unknown encoding: ' + encoding);
  }
  var length = byteLength(string, encoding) | 0;
  var buf = createBuffer(length);
  var actual = buf.write(string, encoding);
  if (actual !== length) {
    // Writing a hex string, for example, that contains invalid characters will
    // cause everything after the first invalid character to be ignored. (e.g.
    // 'abxxcd' will be treated as 'ab')
    buf = buf.slice(0, actual);
  }
  return buf;
}
function fromArrayLike(array) {
  var length = array.length < 0 ? 0 : checked(array.length) | 0;
  var buf = createBuffer(length);
  for (var i = 0; i < length; i += 1) {
    buf[i] = array[i] & 255;
  }
  return buf;
}
function fromArrayBuffer(array, byteOffset, length) {
  if (byteOffset < 0 || array.byteLength < byteOffset) {
    throw new RangeError('"offset" is outside of buffer bounds');
  }
  if (array.byteLength < byteOffset + (length || 0)) {
    throw new RangeError('"length" is outside of buffer bounds');
  }
  var buf;
  if (byteOffset === undefined && length === undefined) {
    buf = new Uint8Array(array);
  } else if (length === undefined) {
    buf = new Uint8Array(array, byteOffset);
  } else {
    buf = new Uint8Array(array, byteOffset, length);
  }

  // Return an augmented `Uint8Array` instance
  buf.__proto__ = Buffer.prototype;
  return buf;
}
function fromObject(obj) {
  if (Buffer.isBuffer(obj)) {
    var len = checked(obj.length) | 0;
    var buf = createBuffer(len);
    if (buf.length === 0) {
      return buf;
    }
    obj.copy(buf, 0, 0, len);
    return buf;
  }
  if (obj.length !== undefined) {
    if (typeof obj.length !== 'number' || numberIsNaN(obj.length)) {
      return createBuffer(0);
    }
    return fromArrayLike(obj);
  }
  if (obj.type === 'Buffer' && Array.isArray(obj.data)) {
    return fromArrayLike(obj.data);
  }
}
function checked(length) {
  // Note: cannot use `length < K_MAX_LENGTH` here because that fails when
  // length is NaN (which is otherwise coerced to zero.)
  if (length >= K_MAX_LENGTH) {
    throw new RangeError('Attempt to allocate Buffer larger than maximum ' + 'size: 0x' + K_MAX_LENGTH.toString(16) + ' bytes');
  }
  return length | 0;
}
function SlowBuffer(length) {
  if (+length != length) {
    // eslint-disable-line eqeqeq
    length = 0;
  }
  return Buffer.alloc(+length);
}
Buffer.isBuffer = function isBuffer(b) {
  return b != null && b._isBuffer === true && b !== Buffer.prototype; // so Buffer.isBuffer(Buffer.prototype) will be false
};

Buffer.compare = function compare(a, b) {
  if (isInstance(a, Uint8Array)) a = Buffer.from(a, a.offset, a.byteLength);
  if (isInstance(b, Uint8Array)) b = Buffer.from(b, b.offset, b.byteLength);
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array');
  }
  if (a === b) return 0;
  var x = a.length;
  var y = b.length;
  for (var i = 0, len = Math.min(x, y); i < len; ++i) {
    if (a[i] !== b[i]) {
      x = a[i];
      y = b[i];
      break;
    }
  }
  if (x < y) return -1;
  if (y < x) return 1;
  return 0;
};
Buffer.isEncoding = function isEncoding(encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'latin1':
    case 'binary':
    case 'base64':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true;
    default:
      return false;
  }
};
Buffer.concat = function concat(list, length) {
  if (!Array.isArray(list)) {
    throw new TypeError('"list" argument must be an Array of Buffers');
  }
  if (list.length === 0) {
    return Buffer.alloc(0);
  }
  var i;
  if (length === undefined) {
    length = 0;
    for (i = 0; i < list.length; ++i) {
      length += list[i].length;
    }
  }
  var buffer = Buffer.allocUnsafe(length);
  var pos = 0;
  for (i = 0; i < list.length; ++i) {
    var buf = list[i];
    if (isInstance(buf, Uint8Array)) {
      buf = Buffer.from(buf);
    }
    if (!Buffer.isBuffer(buf)) {
      throw new TypeError('"list" argument must be an Array of Buffers');
    }
    buf.copy(buffer, pos);
    pos += buf.length;
  }
  return buffer;
};
function byteLength(string, encoding) {
  if (Buffer.isBuffer(string)) {
    return string.length;
  }
  if (ArrayBuffer.isView(string) || isInstance(string, ArrayBuffer)) {
    return string.byteLength;
  }
  if (typeof string !== 'string') {
    throw new TypeError('The "string" argument must be one of type string, Buffer, or ArrayBuffer. ' + 'Received type ' + _typeof(string));
  }
  var len = string.length;
  var mustMatch = arguments.length > 2 && arguments[2] === true;
  if (!mustMatch && len === 0) return 0;

  // Use a for loop to avoid recursion
  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'ascii':
      case 'latin1':
      case 'binary':
        return len;
      case 'utf8':
      case 'utf-8':
        return utf8ToBytes(string).length;
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return len * 2;
      case 'hex':
        return len >>> 1;
      case 'base64':
        return base64ToBytes(string).length;
      default:
        if (loweredCase) {
          return mustMatch ? -1 : utf8ToBytes(string).length; // assume utf8
        }

        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
}
Buffer.byteLength = byteLength;
function slowToString(encoding, start, end) {
  var loweredCase = false;

  // No need to verify that "this.length <= MAX_UINT32" since it's a read-only
  // property of a typed array.

  // This behaves neither like String nor Uint8Array in that we set start/end
  // to their upper/lower bounds if the value passed is out of range.
  // undefined is handled specially as per ECMA-262 6th Edition,
  // Section 13.3.3.7 Runtime Semantics: KeyedBindingInitialization.
  if (start === undefined || start < 0) {
    start = 0;
  }
  // Return early if start > this.length. Done here to prevent potential uint32
  // coercion fail below.
  if (start > this.length) {
    return '';
  }
  if (end === undefined || end > this.length) {
    end = this.length;
  }
  if (end <= 0) {
    return '';
  }

  // Force coersion to uint32. This will also coerce falsey/NaN values to 0.
  end >>>= 0;
  start >>>= 0;
  if (end <= start) {
    return '';
  }
  if (!encoding) encoding = 'utf8';
  while (true) {
    switch (encoding) {
      case 'hex':
        return hexSlice(this, start, end);
      case 'utf8':
      case 'utf-8':
        return utf8Slice(this, start, end);
      case 'ascii':
        return asciiSlice(this, start, end);
      case 'latin1':
      case 'binary':
        return latin1Slice(this, start, end);
      case 'base64':
        return base64Slice(this, start, end);
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return utf16leSlice(this, start, end);
      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding);
        encoding = (encoding + '').toLowerCase();
        loweredCase = true;
    }
  }
}

// This property is used by `Buffer.isBuffer` (and the `is-buffer` npm package)
// to detect a Buffer instance. It's not possible to use `instanceof Buffer`
// reliably in a browserify context because there could be multiple different
// copies of the 'buffer' package in use. This method works even for Buffer
// instances that were created from another copy of the `buffer` package.
// See: https://github.com/feross/buffer/issues/154
Buffer.prototype._isBuffer = true;
function swap(b, n, m) {
  var i = b[n];
  b[n] = b[m];
  b[m] = i;
}
Buffer.prototype.swap16 = function swap16() {
  var len = this.length;
  if (len % 2 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 16-bits');
  }
  for (var i = 0; i < len; i += 2) {
    swap(this, i, i + 1);
  }
  return this;
};
Buffer.prototype.swap32 = function swap32() {
  var len = this.length;
  if (len % 4 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 32-bits');
  }
  for (var i = 0; i < len; i += 4) {
    swap(this, i, i + 3);
    swap(this, i + 1, i + 2);
  }
  return this;
};
Buffer.prototype.swap64 = function swap64() {
  var len = this.length;
  if (len % 8 !== 0) {
    throw new RangeError('Buffer size must be a multiple of 64-bits');
  }
  for (var i = 0; i < len; i += 8) {
    swap(this, i, i + 7);
    swap(this, i + 1, i + 6);
    swap(this, i + 2, i + 5);
    swap(this, i + 3, i + 4);
  }
  return this;
};
Buffer.prototype.toString = function toString() {
  var length = this.length;
  if (length === 0) return '';
  if (arguments.length === 0) return utf8Slice(this, 0, length);
  return slowToString.apply(this, arguments);
};
Buffer.prototype.toLocaleString = Buffer.prototype.toString;
Buffer.prototype.equals = function equals(b) {
  if (!Buffer.isBuffer(b)) throw new TypeError('Argument must be a Buffer');
  if (this === b) return true;
  return Buffer.compare(this, b) === 0;
};
Buffer.prototype.inspect = function inspect() {
  var str = '';
  var max = exports.INSPECT_MAX_BYTES;
  str = this.toString('hex', 0, max).replace(/(.{2})/g, '$1 ').trim();
  if (this.length > max) str += ' ... ';
  return '<Buffer ' + str + '>';
};
Buffer.prototype.compare = function compare(target, start, end, thisStart, thisEnd) {
  if (isInstance(target, Uint8Array)) {
    target = Buffer.from(target, target.offset, target.byteLength);
  }
  if (!Buffer.isBuffer(target)) {
    throw new TypeError('The "target" argument must be one of type Buffer or Uint8Array. ' + 'Received type ' + _typeof(target));
  }
  if (start === undefined) {
    start = 0;
  }
  if (end === undefined) {
    end = target ? target.length : 0;
  }
  if (thisStart === undefined) {
    thisStart = 0;
  }
  if (thisEnd === undefined) {
    thisEnd = this.length;
  }
  if (start < 0 || end > target.length || thisStart < 0 || thisEnd > this.length) {
    throw new RangeError('out of range index');
  }
  if (thisStart >= thisEnd && start >= end) {
    return 0;
  }
  if (thisStart >= thisEnd) {
    return -1;
  }
  if (start >= end) {
    return 1;
  }
  start >>>= 0;
  end >>>= 0;
  thisStart >>>= 0;
  thisEnd >>>= 0;
  if (this === target) return 0;
  var x = thisEnd - thisStart;
  var y = end - start;
  var len = Math.min(x, y);
  var thisCopy = this.slice(thisStart, thisEnd);
  var targetCopy = target.slice(start, end);
  for (var i = 0; i < len; ++i) {
    if (thisCopy[i] !== targetCopy[i]) {
      x = thisCopy[i];
      y = targetCopy[i];
      break;
    }
  }
  if (x < y) return -1;
  if (y < x) return 1;
  return 0;
};

// Finds either the first index of `val` in `buffer` at offset >= `byteOffset`,
// OR the last index of `val` in `buffer` at offset <= `byteOffset`.
//
// Arguments:
// - buffer - a Buffer to search
// - val - a string, Buffer, or number
// - byteOffset - an index into `buffer`; will be clamped to an int32
// - encoding - an optional encoding, relevant is val is a string
// - dir - true for indexOf, false for lastIndexOf
function bidirectionalIndexOf(buffer, val, byteOffset, encoding, dir) {
  // Empty buffer means no match
  if (buffer.length === 0) return -1;

  // Normalize byteOffset
  if (typeof byteOffset === 'string') {
    encoding = byteOffset;
    byteOffset = 0;
  } else if (byteOffset > 0x7fffffff) {
    byteOffset = 0x7fffffff;
  } else if (byteOffset < -0x80000000) {
    byteOffset = -0x80000000;
  }
  byteOffset = +byteOffset; // Coerce to Number.
  if (numberIsNaN(byteOffset)) {
    // byteOffset: it it's undefined, null, NaN, "foo", etc, search whole buffer
    byteOffset = dir ? 0 : buffer.length - 1;
  }

  // Normalize byteOffset: negative offsets start from the end of the buffer
  if (byteOffset < 0) byteOffset = buffer.length + byteOffset;
  if (byteOffset >= buffer.length) {
    if (dir) return -1;else byteOffset = buffer.length - 1;
  } else if (byteOffset < 0) {
    if (dir) byteOffset = 0;else return -1;
  }

  // Normalize val
  if (typeof val === 'string') {
    val = Buffer.from(val, encoding);
  }

  // Finally, search either indexOf (if dir is true) or lastIndexOf
  if (Buffer.isBuffer(val)) {
    // Special case: looking for empty string/buffer always fails
    if (val.length === 0) {
      return -1;
    }
    return arrayIndexOf(buffer, val, byteOffset, encoding, dir);
  } else if (typeof val === 'number') {
    val = val & 0xFF; // Search for a byte value [0-255]
    if (typeof Uint8Array.prototype.indexOf === 'function') {
      if (dir) {
        return Uint8Array.prototype.indexOf.call(buffer, val, byteOffset);
      } else {
        return Uint8Array.prototype.lastIndexOf.call(buffer, val, byteOffset);
      }
    }
    return arrayIndexOf(buffer, [val], byteOffset, encoding, dir);
  }
  throw new TypeError('val must be string, number or Buffer');
}
function arrayIndexOf(arr, val, byteOffset, encoding, dir) {
  var indexSize = 1;
  var arrLength = arr.length;
  var valLength = val.length;
  if (encoding !== undefined) {
    encoding = String(encoding).toLowerCase();
    if (encoding === 'ucs2' || encoding === 'ucs-2' || encoding === 'utf16le' || encoding === 'utf-16le') {
      if (arr.length < 2 || val.length < 2) {
        return -1;
      }
      indexSize = 2;
      arrLength /= 2;
      valLength /= 2;
      byteOffset /= 2;
    }
  }
  function read(buf, i) {
    if (indexSize === 1) {
      return buf[i];
    } else {
      return buf.readUInt16BE(i * indexSize);
    }
  }
  var i;
  if (dir) {
    var foundIndex = -1;
    for (i = byteOffset; i < arrLength; i++) {
      if (read(arr, i) === read(val, foundIndex === -1 ? 0 : i - foundIndex)) {
        if (foundIndex === -1) foundIndex = i;
        if (i - foundIndex + 1 === valLength) return foundIndex * indexSize;
      } else {
        if (foundIndex !== -1) i -= i - foundIndex;
        foundIndex = -1;
      }
    }
  } else {
    if (byteOffset + valLength > arrLength) byteOffset = arrLength - valLength;
    for (i = byteOffset; i >= 0; i--) {
      var found = true;
      for (var j = 0; j < valLength; j++) {
        if (read(arr, i + j) !== read(val, j)) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
  }
  return -1;
}
Buffer.prototype.includes = function includes(val, byteOffset, encoding) {
  return this.indexOf(val, byteOffset, encoding) !== -1;
};
Buffer.prototype.indexOf = function indexOf(val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, true);
};
Buffer.prototype.lastIndexOf = function lastIndexOf(val, byteOffset, encoding) {
  return bidirectionalIndexOf(this, val, byteOffset, encoding, false);
};
function hexWrite(buf, string, offset, length) {
  offset = Number(offset) || 0;
  var remaining = buf.length - offset;
  if (!length) {
    length = remaining;
  } else {
    length = Number(length);
    if (length > remaining) {
      length = remaining;
    }
  }
  var strLen = string.length;
  if (length > strLen / 2) {
    length = strLen / 2;
  }
  for (var i = 0; i < length; ++i) {
    var parsed = parseInt(string.substr(i * 2, 2), 16);
    if (numberIsNaN(parsed)) return i;
    buf[offset + i] = parsed;
  }
  return i;
}
function utf8Write(buf, string, offset, length) {
  return blitBuffer(utf8ToBytes(string, buf.length - offset), buf, offset, length);
}
function asciiWrite(buf, string, offset, length) {
  return blitBuffer(asciiToBytes(string), buf, offset, length);
}
function latin1Write(buf, string, offset, length) {
  return asciiWrite(buf, string, offset, length);
}
function base64Write(buf, string, offset, length) {
  return blitBuffer(base64ToBytes(string), buf, offset, length);
}
function ucs2Write(buf, string, offset, length) {
  return blitBuffer(utf16leToBytes(string, buf.length - offset), buf, offset, length);
}
Buffer.prototype.write = function write(string, offset, length, encoding) {
  // Buffer#write(string)
  if (offset === undefined) {
    encoding = 'utf8';
    length = this.length;
    offset = 0;
    // Buffer#write(string, encoding)
  } else if (length === undefined && typeof offset === 'string') {
    encoding = offset;
    length = this.length;
    offset = 0;
    // Buffer#write(string, offset[, length][, encoding])
  } else if (isFinite(offset)) {
    offset = offset >>> 0;
    if (isFinite(length)) {
      length = length >>> 0;
      if (encoding === undefined) encoding = 'utf8';
    } else {
      encoding = length;
      length = undefined;
    }
  } else {
    throw new Error('Buffer.write(string, encoding, offset[, length]) is no longer supported');
  }
  var remaining = this.length - offset;
  if (length === undefined || length > remaining) length = remaining;
  if (string.length > 0 && (length < 0 || offset < 0) || offset > this.length) {
    throw new RangeError('Attempt to write outside buffer bounds');
  }
  if (!encoding) encoding = 'utf8';
  var loweredCase = false;
  for (;;) {
    switch (encoding) {
      case 'hex':
        return hexWrite(this, string, offset, length);
      case 'utf8':
      case 'utf-8':
        return utf8Write(this, string, offset, length);
      case 'ascii':
        return asciiWrite(this, string, offset, length);
      case 'latin1':
      case 'binary':
        return latin1Write(this, string, offset, length);
      case 'base64':
        // Warning: maxLength not taken into account in base64Write
        return base64Write(this, string, offset, length);
      case 'ucs2':
      case 'ucs-2':
      case 'utf16le':
      case 'utf-16le':
        return ucs2Write(this, string, offset, length);
      default:
        if (loweredCase) throw new TypeError('Unknown encoding: ' + encoding);
        encoding = ('' + encoding).toLowerCase();
        loweredCase = true;
    }
  }
};
Buffer.prototype.toJSON = function toJSON() {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  };
};
function base64Slice(buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf);
  } else {
    return base64.fromByteArray(buf.slice(start, end));
  }
}
function utf8Slice(buf, start, end) {
  end = Math.min(buf.length, end);
  var res = [];
  var i = start;
  while (i < end) {
    var firstByte = buf[i];
    var codePoint = null;
    var bytesPerSequence = firstByte > 0xEF ? 4 : firstByte > 0xDF ? 3 : firstByte > 0xBF ? 2 : 1;
    if (i + bytesPerSequence <= end) {
      var secondByte, thirdByte, fourthByte, tempCodePoint;
      switch (bytesPerSequence) {
        case 1:
          if (firstByte < 0x80) {
            codePoint = firstByte;
          }
          break;
        case 2:
          secondByte = buf[i + 1];
          if ((secondByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0x1F) << 0x6 | secondByte & 0x3F;
            if (tempCodePoint > 0x7F) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 3:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0xC | (secondByte & 0x3F) << 0x6 | thirdByte & 0x3F;
            if (tempCodePoint > 0x7FF && (tempCodePoint < 0xD800 || tempCodePoint > 0xDFFF)) {
              codePoint = tempCodePoint;
            }
          }
          break;
        case 4:
          secondByte = buf[i + 1];
          thirdByte = buf[i + 2];
          fourthByte = buf[i + 3];
          if ((secondByte & 0xC0) === 0x80 && (thirdByte & 0xC0) === 0x80 && (fourthByte & 0xC0) === 0x80) {
            tempCodePoint = (firstByte & 0xF) << 0x12 | (secondByte & 0x3F) << 0xC | (thirdByte & 0x3F) << 0x6 | fourthByte & 0x3F;
            if (tempCodePoint > 0xFFFF && tempCodePoint < 0x110000) {
              codePoint = tempCodePoint;
            }
          }
      }
    }
    if (codePoint === null) {
      // we did not generate a valid codePoint so insert a
      // replacement char (U+FFFD) and advance only 1 byte
      codePoint = 0xFFFD;
      bytesPerSequence = 1;
    } else if (codePoint > 0xFFFF) {
      // encode to utf16 (surrogate pair dance)
      codePoint -= 0x10000;
      res.push(codePoint >>> 10 & 0x3FF | 0xD800);
      codePoint = 0xDC00 | codePoint & 0x3FF;
    }
    res.push(codePoint);
    i += bytesPerSequence;
  }
  return decodeCodePointsArray(res);
}

// Based on http://stackoverflow.com/a/22747272/680742, the browser with
// the lowest limit is Chrome, with 0x10000 args.
// We go 1 magnitude less, for safety
var MAX_ARGUMENTS_LENGTH = 0x1000;
function decodeCodePointsArray(codePoints) {
  var len = codePoints.length;
  if (len <= MAX_ARGUMENTS_LENGTH) {
    return String.fromCharCode.apply(String, codePoints); // avoid extra slice()
  }

  // Decode in chunks to avoid "call stack size exceeded".
  var res = '';
  var i = 0;
  while (i < len) {
    res += String.fromCharCode.apply(String, codePoints.slice(i, i += MAX_ARGUMENTS_LENGTH));
  }
  return res;
}
function asciiSlice(buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);
  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i] & 0x7F);
  }
  return ret;
}
function latin1Slice(buf, start, end) {
  var ret = '';
  end = Math.min(buf.length, end);
  for (var i = start; i < end; ++i) {
    ret += String.fromCharCode(buf[i]);
  }
  return ret;
}
function hexSlice(buf, start, end) {
  var len = buf.length;
  if (!start || start < 0) start = 0;
  if (!end || end < 0 || end > len) end = len;
  var out = '';
  for (var i = start; i < end; ++i) {
    out += toHex(buf[i]);
  }
  return out;
}
function utf16leSlice(buf, start, end) {
  var bytes = buf.slice(start, end);
  var res = '';
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i + 1] * 256);
  }
  return res;
}
Buffer.prototype.slice = function slice(start, end) {
  var len = this.length;
  start = ~~start;
  end = end === undefined ? len : ~~end;
  if (start < 0) {
    start += len;
    if (start < 0) start = 0;
  } else if (start > len) {
    start = len;
  }
  if (end < 0) {
    end += len;
    if (end < 0) end = 0;
  } else if (end > len) {
    end = len;
  }
  if (end < start) end = start;
  var newBuf = this.subarray(start, end);
  // Return an augmented `Uint8Array` instance
  newBuf.__proto__ = Buffer.prototype;
  return newBuf;
};

/*
 * Need to make sure that buffer isn't trying to write out of bounds.
 */
function checkOffset(offset, ext, length) {
  if (offset % 1 !== 0 || offset < 0) throw new RangeError('offset is not uint');
  if (offset + ext > length) throw new RangeError('Trying to access beyond buffer length');
}
Buffer.prototype.readUIntLE = function readUIntLE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);
  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  return val;
};
Buffer.prototype.readUIntBE = function readUIntBE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) {
    checkOffset(offset, byteLength, this.length);
  }
  var val = this[offset + --byteLength];
  var mul = 1;
  while (byteLength > 0 && (mul *= 0x100)) {
    val += this[offset + --byteLength] * mul;
  }
  return val;
};
Buffer.prototype.readUInt8 = function readUInt8(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 1, this.length);
  return this[offset];
};
Buffer.prototype.readUInt16LE = function readUInt16LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] | this[offset + 1] << 8;
};
Buffer.prototype.readUInt16BE = function readUInt16BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  return this[offset] << 8 | this[offset + 1];
};
Buffer.prototype.readUInt32LE = function readUInt32LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return (this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16) + this[offset + 3] * 0x1000000;
};
Buffer.prototype.readUInt32BE = function readUInt32BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return this[offset] * 0x1000000 + (this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3]);
};
Buffer.prototype.readIntLE = function readIntLE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);
  var val = this[offset];
  var mul = 1;
  var i = 0;
  while (++i < byteLength && (mul *= 0x100)) {
    val += this[offset + i] * mul;
  }
  mul *= 0x80;
  if (val >= mul) val -= Math.pow(2, 8 * byteLength);
  return val;
};
Buffer.prototype.readIntBE = function readIntBE(offset, byteLength, noAssert) {
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) checkOffset(offset, byteLength, this.length);
  var i = byteLength;
  var mul = 1;
  var val = this[offset + --i];
  while (i > 0 && (mul *= 0x100)) {
    val += this[offset + --i] * mul;
  }
  mul *= 0x80;
  if (val >= mul) val -= Math.pow(2, 8 * byteLength);
  return val;
};
Buffer.prototype.readInt8 = function readInt8(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 1, this.length);
  if (!(this[offset] & 0x80)) return this[offset];
  return (0xff - this[offset] + 1) * -1;
};
Buffer.prototype.readInt16LE = function readInt16LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset] | this[offset + 1] << 8;
  return val & 0x8000 ? val | 0xFFFF0000 : val;
};
Buffer.prototype.readInt16BE = function readInt16BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 2, this.length);
  var val = this[offset + 1] | this[offset] << 8;
  return val & 0x8000 ? val | 0xFFFF0000 : val;
};
Buffer.prototype.readInt32LE = function readInt32LE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return this[offset] | this[offset + 1] << 8 | this[offset + 2] << 16 | this[offset + 3] << 24;
};
Buffer.prototype.readInt32BE = function readInt32BE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return this[offset] << 24 | this[offset + 1] << 16 | this[offset + 2] << 8 | this[offset + 3];
};
Buffer.prototype.readFloatLE = function readFloatLE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return ieee754.read(this, offset, true, 23, 4);
};
Buffer.prototype.readFloatBE = function readFloatBE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 4, this.length);
  return ieee754.read(this, offset, false, 23, 4);
};
Buffer.prototype.readDoubleLE = function readDoubleLE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 8, this.length);
  return ieee754.read(this, offset, true, 52, 8);
};
Buffer.prototype.readDoubleBE = function readDoubleBE(offset, noAssert) {
  offset = offset >>> 0;
  if (!noAssert) checkOffset(offset, 8, this.length);
  return ieee754.read(this, offset, false, 52, 8);
};
function checkInt(buf, value, offset, ext, max, min) {
  if (!Buffer.isBuffer(buf)) throw new TypeError('"buffer" argument must be a Buffer instance');
  if (value > max || value < min) throw new RangeError('"value" argument is out of bounds');
  if (offset + ext > buf.length) throw new RangeError('Index out of range');
}
Buffer.prototype.writeUIntLE = function writeUIntLE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }
  var mul = 1;
  var i = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    this[offset + i] = value / mul & 0xFF;
  }
  return offset + byteLength;
};
Buffer.prototype.writeUIntBE = function writeUIntBE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  byteLength = byteLength >>> 0;
  if (!noAssert) {
    var maxBytes = Math.pow(2, 8 * byteLength) - 1;
    checkInt(this, value, offset, byteLength, maxBytes, 0);
  }
  var i = byteLength - 1;
  var mul = 1;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    this[offset + i] = value / mul & 0xFF;
  }
  return offset + byteLength;
};
Buffer.prototype.writeUInt8 = function writeUInt8(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0xff, 0);
  this[offset] = value & 0xff;
  return offset + 1;
};
Buffer.prototype.writeUInt16LE = function writeUInt16LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  this[offset] = value & 0xff;
  this[offset + 1] = value >>> 8;
  return offset + 2;
};
Buffer.prototype.writeUInt16BE = function writeUInt16BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0xffff, 0);
  this[offset] = value >>> 8;
  this[offset + 1] = value & 0xff;
  return offset + 2;
};
Buffer.prototype.writeUInt32LE = function writeUInt32LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  this[offset + 3] = value >>> 24;
  this[offset + 2] = value >>> 16;
  this[offset + 1] = value >>> 8;
  this[offset] = value & 0xff;
  return offset + 4;
};
Buffer.prototype.writeUInt32BE = function writeUInt32BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0xffffffff, 0);
  this[offset] = value >>> 24;
  this[offset + 1] = value >>> 16;
  this[offset + 2] = value >>> 8;
  this[offset + 3] = value & 0xff;
  return offset + 4;
};
Buffer.prototype.writeIntLE = function writeIntLE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);
    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }
  var i = 0;
  var mul = 1;
  var sub = 0;
  this[offset] = value & 0xFF;
  while (++i < byteLength && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i - 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = (value / mul >> 0) - sub & 0xFF;
  }
  return offset + byteLength;
};
Buffer.prototype.writeIntBE = function writeIntBE(value, offset, byteLength, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    var limit = Math.pow(2, 8 * byteLength - 1);
    checkInt(this, value, offset, byteLength, limit - 1, -limit);
  }
  var i = byteLength - 1;
  var mul = 1;
  var sub = 0;
  this[offset + i] = value & 0xFF;
  while (--i >= 0 && (mul *= 0x100)) {
    if (value < 0 && sub === 0 && this[offset + i + 1] !== 0) {
      sub = 1;
    }
    this[offset + i] = (value / mul >> 0) - sub & 0xFF;
  }
  return offset + byteLength;
};
Buffer.prototype.writeInt8 = function writeInt8(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 1, 0x7f, -0x80);
  if (value < 0) value = 0xff + value + 1;
  this[offset] = value & 0xff;
  return offset + 1;
};
Buffer.prototype.writeInt16LE = function writeInt16LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  this[offset] = value & 0xff;
  this[offset + 1] = value >>> 8;
  return offset + 2;
};
Buffer.prototype.writeInt16BE = function writeInt16BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 2, 0x7fff, -0x8000);
  this[offset] = value >>> 8;
  this[offset + 1] = value & 0xff;
  return offset + 2;
};
Buffer.prototype.writeInt32LE = function writeInt32LE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  this[offset] = value & 0xff;
  this[offset + 1] = value >>> 8;
  this[offset + 2] = value >>> 16;
  this[offset + 3] = value >>> 24;
  return offset + 4;
};
Buffer.prototype.writeInt32BE = function writeInt32BE(value, offset, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) checkInt(this, value, offset, 4, 0x7fffffff, -0x80000000);
  if (value < 0) value = 0xffffffff + value + 1;
  this[offset] = value >>> 24;
  this[offset + 1] = value >>> 16;
  this[offset + 2] = value >>> 8;
  this[offset + 3] = value & 0xff;
  return offset + 4;
};
function checkIEEE754(buf, value, offset, ext, max, min) {
  if (offset + ext > buf.length) throw new RangeError('Index out of range');
  if (offset < 0) throw new RangeError('Index out of range');
}
function writeFloat(buf, value, offset, littleEndian, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 4, 3.4028234663852886e+38, -3.4028234663852886e+38);
  }
  ieee754.write(buf, value, offset, littleEndian, 23, 4);
  return offset + 4;
}
Buffer.prototype.writeFloatLE = function writeFloatLE(value, offset, noAssert) {
  return writeFloat(this, value, offset, true, noAssert);
};
Buffer.prototype.writeFloatBE = function writeFloatBE(value, offset, noAssert) {
  return writeFloat(this, value, offset, false, noAssert);
};
function writeDouble(buf, value, offset, littleEndian, noAssert) {
  value = +value;
  offset = offset >>> 0;
  if (!noAssert) {
    checkIEEE754(buf, value, offset, 8, 1.7976931348623157E+308, -1.7976931348623157E+308);
  }
  ieee754.write(buf, value, offset, littleEndian, 52, 8);
  return offset + 8;
}
Buffer.prototype.writeDoubleLE = function writeDoubleLE(value, offset, noAssert) {
  return writeDouble(this, value, offset, true, noAssert);
};
Buffer.prototype.writeDoubleBE = function writeDoubleBE(value, offset, noAssert) {
  return writeDouble(this, value, offset, false, noAssert);
};

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function copy(target, targetStart, start, end) {
  if (!Buffer.isBuffer(target)) throw new TypeError('argument should be a Buffer');
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (targetStart >= target.length) targetStart = target.length;
  if (!targetStart) targetStart = 0;
  if (end > 0 && end < start) end = start;

  // Copy 0 bytes; we're done
  if (end === start) return 0;
  if (target.length === 0 || this.length === 0) return 0;

  // Fatal error conditions
  if (targetStart < 0) {
    throw new RangeError('targetStart out of bounds');
  }
  if (start < 0 || start >= this.length) throw new RangeError('Index out of range');
  if (end < 0) throw new RangeError('sourceEnd out of bounds');

  // Are we oob?
  if (end > this.length) end = this.length;
  if (target.length - targetStart < end - start) {
    end = target.length - targetStart + start;
  }
  var len = end - start;
  if (this === target && typeof Uint8Array.prototype.copyWithin === 'function') {
    // Use built-in when available, missing from IE11
    this.copyWithin(targetStart, start, end);
  } else if (this === target && start < targetStart && targetStart < end) {
    // descending copy from end
    for (var i = len - 1; i >= 0; --i) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    Uint8Array.prototype.set.call(target, this.subarray(start, end), targetStart);
  }
  return len;
};

// Usage:
//    buffer.fill(number[, offset[, end]])
//    buffer.fill(buffer[, offset[, end]])
//    buffer.fill(string[, offset[, end]][, encoding])
Buffer.prototype.fill = function fill(val, start, end, encoding) {
  // Handle string cases:
  if (typeof val === 'string') {
    if (typeof start === 'string') {
      encoding = start;
      start = 0;
      end = this.length;
    } else if (typeof end === 'string') {
      encoding = end;
      end = this.length;
    }
    if (encoding !== undefined && typeof encoding !== 'string') {
      throw new TypeError('encoding must be a string');
    }
    if (typeof encoding === 'string' && !Buffer.isEncoding(encoding)) {
      throw new TypeError('Unknown encoding: ' + encoding);
    }
    if (val.length === 1) {
      var code = val.charCodeAt(0);
      if (encoding === 'utf8' && code < 128 || encoding === 'latin1') {
        // Fast path: If `val` fits into a single byte, use that numeric value.
        val = code;
      }
    }
  } else if (typeof val === 'number') {
    val = val & 255;
  }

  // Invalid ranges are not set to a default, so can range check early.
  if (start < 0 || this.length < start || this.length < end) {
    throw new RangeError('Out of range index');
  }
  if (end <= start) {
    return this;
  }
  start = start >>> 0;
  end = end === undefined ? this.length : end >>> 0;
  if (!val) val = 0;
  var i;
  if (typeof val === 'number') {
    for (i = start; i < end; ++i) {
      this[i] = val;
    }
  } else {
    var bytes = Buffer.isBuffer(val) ? val : Buffer.from(val, encoding);
    var len = bytes.length;
    if (len === 0) {
      throw new TypeError('The value "' + val + '" is invalid for argument "value"');
    }
    for (i = 0; i < end - start; ++i) {
      this[i + start] = bytes[i % len];
    }
  }
  return this;
};

// HELPER FUNCTIONS
// ================

var INVALID_BASE64_RE = /[^+/0-9A-Za-z-_]/g;
function base64clean(str) {
  // Node takes equal signs as end of the Base64 encoding
  str = str.split('=')[0];
  // Node strips out invalid characters like \n and \t from the string, base64-js does not
  str = str.trim().replace(INVALID_BASE64_RE, '');
  // Node converts strings with length < 2 to ''
  if (str.length < 2) return '';
  // Node allows for non-padded base64 strings (missing trailing ===), base64-js does not
  while (str.length % 4 !== 0) {
    str = str + '=';
  }
  return str;
}
function toHex(n) {
  if (n < 16) return '0' + n.toString(16);
  return n.toString(16);
}
function utf8ToBytes(string, units) {
  units = units || Infinity;
  var codePoint;
  var length = string.length;
  var leadSurrogate = null;
  var bytes = [];
  for (var i = 0; i < length; ++i) {
    codePoint = string.charCodeAt(i);

    // is surrogate component
    if (codePoint > 0xD7FF && codePoint < 0xE000) {
      // last char was a lead
      if (!leadSurrogate) {
        // no lead yet
        if (codePoint > 0xDBFF) {
          // unexpected trail
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue;
        } else if (i + 1 === length) {
          // unpaired lead
          if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
          continue;
        }

        // valid lead
        leadSurrogate = codePoint;
        continue;
      }

      // 2 leads in a row
      if (codePoint < 0xDC00) {
        if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
        leadSurrogate = codePoint;
        continue;
      }

      // valid surrogate pair
      codePoint = (leadSurrogate - 0xD800 << 10 | codePoint - 0xDC00) + 0x10000;
    } else if (leadSurrogate) {
      // valid bmp char, but last char was a lead
      if ((units -= 3) > -1) bytes.push(0xEF, 0xBF, 0xBD);
    }
    leadSurrogate = null;

    // encode utf8
    if (codePoint < 0x80) {
      if ((units -= 1) < 0) break;
      bytes.push(codePoint);
    } else if (codePoint < 0x800) {
      if ((units -= 2) < 0) break;
      bytes.push(codePoint >> 0x6 | 0xC0, codePoint & 0x3F | 0x80);
    } else if (codePoint < 0x10000) {
      if ((units -= 3) < 0) break;
      bytes.push(codePoint >> 0xC | 0xE0, codePoint >> 0x6 & 0x3F | 0x80, codePoint & 0x3F | 0x80);
    } else if (codePoint < 0x110000) {
      if ((units -= 4) < 0) break;
      bytes.push(codePoint >> 0x12 | 0xF0, codePoint >> 0xC & 0x3F | 0x80, codePoint >> 0x6 & 0x3F | 0x80, codePoint & 0x3F | 0x80);
    } else {
      throw new Error('Invalid code point');
    }
  }
  return bytes;
}
function asciiToBytes(str) {
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF);
  }
  return byteArray;
}
function utf16leToBytes(str, units) {
  var c, hi, lo;
  var byteArray = [];
  for (var i = 0; i < str.length; ++i) {
    if ((units -= 2) < 0) break;
    c = str.charCodeAt(i);
    hi = c >> 8;
    lo = c % 256;
    byteArray.push(lo);
    byteArray.push(hi);
  }
  return byteArray;
}
function base64ToBytes(str) {
  return base64.toByteArray(base64clean(str));
}
function blitBuffer(src, dst, offset, length) {
  for (var i = 0; i < length; ++i) {
    if (i + offset >= dst.length || i >= src.length) break;
    dst[i + offset] = src[i];
  }
  return i;
}

// ArrayBuffer or Uint8Array objects from other contexts (i.e. iframes) do not pass
// the `instanceof` check but they should be treated as of that type.
// See: https://github.com/feross/buffer/issues/166
function isInstance(obj, type) {
  return obj instanceof type || obj != null && obj.constructor != null && obj.constructor.name != null && obj.constructor.name === type.name;
}
function numberIsNaN(obj) {
  // For IE11 support
  return obj !== obj; // eslint-disable-line no-self-compare
}
}).call(this)}).call(this,require("buffer").Buffer)
},{"base64-js":33,"buffer":34,"ieee754":36}],35:[function(require,module,exports){
"use strict";

/**
 * event-lite.js - Light-weight EventEmitter (less than 1KB when gzipped)
 *
 * @copyright Yusuke Kawasaki
 * @license MIT
 * @constructor
 * @see https://github.com/kawanet/event-lite
 * @see http://kawanet.github.io/event-lite/EventLite.html
 * @example
 * var EventLite = require("event-lite");
 *
 * function MyClass() {...}             // your class
 *
 * EventLite.mixin(MyClass.prototype);  // import event methods
 *
 * var obj = new MyClass();
 * obj.on("foo", function() {...});     // add event listener
 * obj.once("bar", function() {...});   // add one-time event listener
 * obj.emit("foo");                     // dispatch event
 * obj.emit("bar");                     // dispatch another event
 * obj.off("foo");                      // remove event listener
 */

function EventLite() {
  if (!(this instanceof EventLite)) return new EventLite();
}
(function (EventLite) {
  // export the class for node.js
  if ("undefined" !== typeof module) module.exports = EventLite;

  // property name to hold listeners
  var LISTENERS = "listeners";

  // methods to export
  var methods = {
    on: on,
    once: once,
    off: off,
    emit: emit
  };

  // mixin to self
  mixin(EventLite.prototype);

  // export mixin function
  EventLite.mixin = mixin;

  /**
   * Import on(), once(), off() and emit() methods into target object.
   *
   * @function EventLite.mixin
   * @param target {Prototype}
   */

  function mixin(target) {
    for (var key in methods) {
      target[key] = methods[key];
    }
    return target;
  }

  /**
   * Add an event listener.
   *
   * @function EventLite.prototype.on
   * @param type {string}
   * @param func {Function}
   * @returns {EventLite} Self for method chaining
   */

  function on(type, func) {
    getListeners(this, type).push(func);
    return this;
  }

  /**
   * Add one-time event listener.
   *
   * @function EventLite.prototype.once
   * @param type {string}
   * @param func {Function}
   * @returns {EventLite} Self for method chaining
   */

  function once(type, func) {
    var that = this;
    wrap.originalListener = func;
    getListeners(that, type).push(wrap);
    return that;
    function wrap() {
      off.call(that, type, wrap);
      func.apply(this, arguments);
    }
  }

  /**
   * Remove an event listener.
   *
   * @function EventLite.prototype.off
   * @param [type] {string}
   * @param [func] {Function}
   * @returns {EventLite} Self for method chaining
   */

  function off(type, func) {
    var that = this;
    var listners;
    if (!arguments.length) {
      delete that[LISTENERS];
    } else if (!func) {
      listners = that[LISTENERS];
      if (listners) {
        delete listners[type];
        if (!Object.keys(listners).length) return off.call(that);
      }
    } else {
      listners = getListeners(that, type, true);
      if (listners) {
        listners = listners.filter(ne);
        if (!listners.length) return off.call(that, type);
        that[LISTENERS][type] = listners;
      }
    }
    return that;
    function ne(test) {
      return test !== func && test.originalListener !== func;
    }
  }

  /**
   * Dispatch (trigger) an event.
   *
   * @function EventLite.prototype.emit
   * @param type {string}
   * @param [value] {*}
   * @returns {boolean} True when a listener received the event
   */

  function emit(type, value) {
    var that = this;
    var listeners = getListeners(that, type, true);
    if (!listeners) return false;
    var arglen = arguments.length;
    if (arglen === 1) {
      listeners.forEach(zeroarg);
    } else if (arglen === 2) {
      listeners.forEach(onearg);
    } else {
      var args = Array.prototype.slice.call(arguments, 1);
      listeners.forEach(moreargs);
    }
    return !!listeners.length;
    function zeroarg(func) {
      func.call(that);
    }
    function onearg(func) {
      func.call(that, value);
    }
    function moreargs(func) {
      func.apply(that, args);
    }
  }

  /**
   * @ignore
   */

  function getListeners(that, type, readonly) {
    if (readonly && !that[LISTENERS]) return;
    var listeners = that[LISTENERS] || (that[LISTENERS] = {});
    return listeners[type] || (listeners[type] = []);
  }
})(EventLite);
},{}],36:[function(require,module,exports){
"use strict";

/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
exports.read = function (buffer, offset, isLE, mLen, nBytes) {
  var e, m;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var nBits = -7;
  var i = isLE ? nBytes - 1 : 0;
  var d = isLE ? -1 : 1;
  var s = buffer[offset + i];
  i += d;
  e = s & (1 << -nBits) - 1;
  s >>= -nBits;
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8) {}
  m = e & (1 << -nBits) - 1;
  e >>= -nBits;
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8) {}
  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : (s ? -1 : 1) * Infinity;
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};
exports.write = function (buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c;
  var eLen = nBytes * 8 - mLen - 1;
  var eMax = (1 << eLen) - 1;
  var eBias = eMax >> 1;
  var rt = mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0;
  var i = isLE ? 0 : nBytes - 1;
  var d = isLE ? 1 : -1;
  var s = value < 0 || value === 0 && 1 / value < 0 ? 1 : 0;
  value = Math.abs(value);
  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }
    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }
  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8) {}
  e = e << mLen | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8) {}
  buffer[offset + i - d] |= s * 128;
};
},{}],37:[function(require,module,exports){
(function (Buffer){(function (){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
// int64-buffer.js

/*jshint -W018 */ // Confusing use of '!'.
/*jshint -W030 */ // Expected an assignment or function call and instead saw an expression.
/*jshint -W093 */ // Did you mean to return a conditional instead of an assignment?

var Uint64BE, Int64BE, Uint64LE, Int64LE;
!function (exports) {
  // constants

  var UNDEFINED = "undefined";
  var BUFFER = UNDEFINED !== (typeof Buffer === "undefined" ? "undefined" : _typeof(Buffer)) && Buffer;
  var UINT8ARRAY = UNDEFINED !== (typeof Uint8Array === "undefined" ? "undefined" : _typeof(Uint8Array)) && Uint8Array;
  var ARRAYBUFFER = UNDEFINED !== (typeof ArrayBuffer === "undefined" ? "undefined" : _typeof(ArrayBuffer)) && ArrayBuffer;
  var ZERO = [0, 0, 0, 0, 0, 0, 0, 0];
  var isArray = Array.isArray || _isArray;
  var BIT32 = 4294967296;
  var BIT24 = 16777216;

  // storage class

  var storage; // Array;

  // generate classes

  Uint64BE = factory("Uint64BE", true, true);
  Int64BE = factory("Int64BE", true, false);
  Uint64LE = factory("Uint64LE", false, true);
  Int64LE = factory("Int64LE", false, false);

  // class factory

  function factory(name, bigendian, unsigned) {
    var posH = bigendian ? 0 : 4;
    var posL = bigendian ? 4 : 0;
    var pos0 = bigendian ? 0 : 3;
    var pos1 = bigendian ? 1 : 2;
    var pos2 = bigendian ? 2 : 1;
    var pos3 = bigendian ? 3 : 0;
    var fromPositive = bigendian ? fromPositiveBE : fromPositiveLE;
    var fromNegative = bigendian ? fromNegativeBE : fromNegativeLE;
    var proto = Int64.prototype;
    var isName = "is" + name;
    var _isInt64 = "_" + isName;

    // properties
    proto.buffer = void 0;
    proto.offset = 0;
    proto[_isInt64] = true;

    // methods
    proto.toNumber = toNumber;
    proto.toString = toString;
    proto.toJSON = toNumber;
    proto.toArray = toArray;

    // add .toBuffer() method only when Buffer available
    if (BUFFER) proto.toBuffer = toBuffer;

    // add .toArrayBuffer() method only when Uint8Array available
    if (UINT8ARRAY) proto.toArrayBuffer = toArrayBuffer;

    // isUint64BE, isInt64BE
    Int64[isName] = isInt64;

    // CommonJS
    exports[name] = Int64;
    return Int64;

    // constructor
    function Int64(buffer, offset, value, raddix) {
      if (!(this instanceof Int64)) return new Int64(buffer, offset, value, raddix);
      return init(this, buffer, offset, value, raddix);
    }

    // isUint64BE, isInt64BE
    function isInt64(b) {
      return !!(b && b[_isInt64]);
    }

    // initializer
    function init(that, buffer, offset, value, raddix) {
      if (UINT8ARRAY && ARRAYBUFFER) {
        if (buffer instanceof ARRAYBUFFER) buffer = new UINT8ARRAY(buffer);
        if (value instanceof ARRAYBUFFER) value = new UINT8ARRAY(value);
      }

      // Int64BE() style
      if (!buffer && !offset && !value && !storage) {
        // shortcut to initialize with zero
        that.buffer = newArray(ZERO, 0);
        return;
      }

      // Int64BE(value, raddix) style
      if (!isValidBuffer(buffer, offset)) {
        var _storage = storage || Array;
        raddix = offset;
        value = buffer;
        offset = 0;
        buffer = new _storage(8);
      }
      that.buffer = buffer;
      that.offset = offset |= 0;

      // Int64BE(buffer, offset) style
      if (UNDEFINED === _typeof(value)) return;

      // Int64BE(buffer, offset, value, raddix) style
      if ("string" === typeof value) {
        fromString(buffer, offset, value, raddix || 10);
      } else if (isValidBuffer(value, raddix)) {
        fromArray(buffer, offset, value, raddix);
      } else if ("number" === typeof raddix) {
        writeInt32(buffer, offset + posH, value); // high
        writeInt32(buffer, offset + posL, raddix); // low
      } else if (value > 0) {
        fromPositive(buffer, offset, value); // positive
      } else if (value < 0) {
        fromNegative(buffer, offset, value); // negative
      } else {
        fromArray(buffer, offset, ZERO, 0); // zero, NaN and others
      }
    }

    function fromString(buffer, offset, str, raddix) {
      var pos = 0;
      var len = str.length;
      var high = 0;
      var low = 0;
      if (str[0] === "-") pos++;
      var sign = pos;
      while (pos < len) {
        var chr = parseInt(str[pos++], raddix);
        if (!(chr >= 0)) break; // NaN
        low = low * raddix + chr;
        high = high * raddix + Math.floor(low / BIT32);
        low %= BIT32;
      }
      if (sign) {
        high = ~high;
        if (low) {
          low = BIT32 - low;
        } else {
          high++;
        }
      }
      writeInt32(buffer, offset + posH, high);
      writeInt32(buffer, offset + posL, low);
    }
    function toNumber() {
      var buffer = this.buffer;
      var offset = this.offset;
      var high = readInt32(buffer, offset + posH);
      var low = readInt32(buffer, offset + posL);
      if (!unsigned) high |= 0; // a trick to get signed
      return high ? high * BIT32 + low : low;
    }
    function toString(radix) {
      var buffer = this.buffer;
      var offset = this.offset;
      var high = readInt32(buffer, offset + posH);
      var low = readInt32(buffer, offset + posL);
      var str = "";
      var sign = !unsigned && high & 0x80000000;
      if (sign) {
        high = ~high;
        low = BIT32 - low;
      }
      radix = radix || 10;
      while (1) {
        var mod = high % radix * BIT32 + low;
        high = Math.floor(high / radix);
        low = Math.floor(mod / radix);
        str = (mod % radix).toString(radix) + str;
        if (!high && !low) break;
      }
      if (sign) {
        str = "-" + str;
      }
      return str;
    }
    function writeInt32(buffer, offset, value) {
      buffer[offset + pos3] = value & 255;
      value = value >> 8;
      buffer[offset + pos2] = value & 255;
      value = value >> 8;
      buffer[offset + pos1] = value & 255;
      value = value >> 8;
      buffer[offset + pos0] = value & 255;
    }
    function readInt32(buffer, offset) {
      return buffer[offset + pos0] * BIT24 + (buffer[offset + pos1] << 16) + (buffer[offset + pos2] << 8) + buffer[offset + pos3];
    }
  }
  function toArray(raw) {
    var buffer = this.buffer;
    var offset = this.offset;
    storage = null; // Array
    if (raw !== false && offset === 0 && buffer.length === 8 && isArray(buffer)) return buffer;
    return newArray(buffer, offset);
  }
  function toBuffer(raw) {
    var buffer = this.buffer;
    var offset = this.offset;
    storage = BUFFER;
    if (raw !== false && offset === 0 && buffer.length === 8 && Buffer.isBuffer(buffer)) return buffer;
    var dest = new BUFFER(8);
    fromArray(dest, 0, buffer, offset);
    return dest;
  }
  function toArrayBuffer(raw) {
    var buffer = this.buffer;
    var offset = this.offset;
    var arrbuf = buffer.buffer;
    storage = UINT8ARRAY;
    if (raw !== false && offset === 0 && arrbuf instanceof ARRAYBUFFER && arrbuf.byteLength === 8) return arrbuf;
    var dest = new UINT8ARRAY(8);
    fromArray(dest, 0, buffer, offset);
    return dest.buffer;
  }
  function isValidBuffer(buffer, offset) {
    var len = buffer && buffer.length;
    offset |= 0;
    return len && offset + 8 <= len && "string" !== typeof buffer[offset];
  }
  function fromArray(destbuf, destoff, srcbuf, srcoff) {
    destoff |= 0;
    srcoff |= 0;
    for (var i = 0; i < 8; i++) {
      destbuf[destoff++] = srcbuf[srcoff++] & 255;
    }
  }
  function newArray(buffer, offset) {
    return Array.prototype.slice.call(buffer, offset, offset + 8);
  }
  function fromPositiveBE(buffer, offset, value) {
    var pos = offset + 8;
    while (pos > offset) {
      buffer[--pos] = value & 255;
      value /= 256;
    }
  }
  function fromNegativeBE(buffer, offset, value) {
    var pos = offset + 8;
    value++;
    while (pos > offset) {
      buffer[--pos] = -value & 255 ^ 255;
      value /= 256;
    }
  }
  function fromPositiveLE(buffer, offset, value) {
    var end = offset + 8;
    while (offset < end) {
      buffer[offset++] = value & 255;
      value /= 256;
    }
  }
  function fromNegativeLE(buffer, offset, value) {
    var end = offset + 8;
    value++;
    while (offset < end) {
      buffer[offset++] = -value & 255 ^ 255;
      value /= 256;
    }
  }

  // https://github.com/retrofox/is-array
  function _isArray(val) {
    return !!val && "[object Array]" == Object.prototype.toString.call(val);
  }
}((typeof exports === "undefined" ? "undefined" : _typeof(exports)) === 'object' && typeof exports.nodeName !== 'string' ? exports : void 0 || {});
}).call(this)}).call(this,require("buffer").Buffer)
},{"buffer":34}],38:[function(require,module,exports){
"use strict";

var toString = {}.toString;
module.exports = Array.isArray || function (arr) {
  return toString.call(arr) == '[object Array]';
};
},{}],39:[function(require,module,exports){
"use strict";

// browser.js

exports.encode = require("./encode").encode;
exports.decode = require("./decode").decode;
exports.Encoder = require("./encoder").Encoder;
exports.Decoder = require("./decoder").Decoder;
exports.createCodec = require("./ext").createCodec;
exports.codec = require("./codec").codec;
},{"./codec":48,"./decode":50,"./decoder":51,"./encode":53,"./encoder":54,"./ext":58}],40:[function(require,module,exports){
(function (Buffer){(function (){
"use strict";

/* globals Buffer */

module.exports = c("undefined" !== typeof Buffer && Buffer) || c((void 0).Buffer) || c("undefined" !== typeof window && window.Buffer) || (void 0).Buffer;
function c(B) {
  return B && B.isBuffer && B;
}
}).call(this)}).call(this,require("buffer").Buffer)
},{"buffer":34}],41:[function(require,module,exports){
"use strict";

// buffer-lite.js

var MAXBUFLEN = 8192;
exports.copy = copy;
exports.toString = toString;
exports.write = write;

/**
 * Buffer.prototype.write()
 *
 * @param string {String}
 * @param [offset] {Number}
 * @returns {Number}
 */

function write(string, offset) {
  var buffer = this;
  var index = offset || (offset |= 0);
  var length = string.length;
  var chr = 0;
  var i = 0;
  while (i < length) {
    chr = string.charCodeAt(i++);
    if (chr < 128) {
      buffer[index++] = chr;
    } else if (chr < 0x800) {
      // 2 bytes
      buffer[index++] = 0xC0 | chr >>> 6;
      buffer[index++] = 0x80 | chr & 0x3F;
    } else if (chr < 0xD800 || chr > 0xDFFF) {
      // 3 bytes
      buffer[index++] = 0xE0 | chr >>> 12;
      buffer[index++] = 0x80 | chr >>> 6 & 0x3F;
      buffer[index++] = 0x80 | chr & 0x3F;
    } else {
      // 4 bytes - surrogate pair
      chr = (chr - 0xD800 << 10 | string.charCodeAt(i++) - 0xDC00) + 0x10000;
      buffer[index++] = 0xF0 | chr >>> 18;
      buffer[index++] = 0x80 | chr >>> 12 & 0x3F;
      buffer[index++] = 0x80 | chr >>> 6 & 0x3F;
      buffer[index++] = 0x80 | chr & 0x3F;
    }
  }
  return index - offset;
}

/**
 * Buffer.prototype.toString()
 *
 * @param [encoding] {String} ignored
 * @param [start] {Number}
 * @param [end] {Number}
 * @returns {String}
 */

function toString(encoding, start, end) {
  var buffer = this;
  var index = start | 0;
  if (!end) end = buffer.length;
  var string = '';
  var chr = 0;
  while (index < end) {
    chr = buffer[index++];
    if (chr < 128) {
      string += String.fromCharCode(chr);
      continue;
    }
    if ((chr & 0xE0) === 0xC0) {
      // 2 bytes
      chr = (chr & 0x1F) << 6 | buffer[index++] & 0x3F;
    } else if ((chr & 0xF0) === 0xE0) {
      // 3 bytes
      chr = (chr & 0x0F) << 12 | (buffer[index++] & 0x3F) << 6 | buffer[index++] & 0x3F;
    } else if ((chr & 0xF8) === 0xF0) {
      // 4 bytes
      chr = (chr & 0x07) << 18 | (buffer[index++] & 0x3F) << 12 | (buffer[index++] & 0x3F) << 6 | buffer[index++] & 0x3F;
    }
    if (chr >= 0x010000) {
      // A surrogate pair
      chr -= 0x010000;
      string += String.fromCharCode((chr >>> 10) + 0xD800, (chr & 0x3FF) + 0xDC00);
    } else {
      string += String.fromCharCode(chr);
    }
  }
  return string;
}

/**
 * Buffer.prototype.copy()
 *
 * @param target {Buffer}
 * @param [targetStart] {Number}
 * @param [start] {Number}
 * @param [end] {Number}
 * @returns {number}
 */

function copy(target, targetStart, start, end) {
  var i;
  if (!start) start = 0;
  if (!end && end !== 0) end = this.length;
  if (!targetStart) targetStart = 0;
  var len = end - start;
  if (target === this && start < targetStart && targetStart < end) {
    // descending
    for (i = len - 1; i >= 0; i--) {
      target[i + targetStart] = this[i + start];
    }
  } else {
    // ascending
    for (i = 0; i < len; i++) {
      target[i + targetStart] = this[i + start];
    }
  }
  return len;
}
},{}],42:[function(require,module,exports){
"use strict";

// bufferish-array.js

var Bufferish = require("./bufferish");
var _exports = module.exports = alloc(0);
_exports.alloc = alloc;
_exports.concat = Bufferish.concat;
_exports.from = from;

/**
 * @param size {Number}
 * @returns {Buffer|Uint8Array|Array}
 */

function alloc(size) {
  return new Array(size);
}

/**
 * @param value {Array|ArrayBuffer|Buffer|String}
 * @returns {Array}
 */

function from(value) {
  if (!Bufferish.isBuffer(value) && Bufferish.isView(value)) {
    // TypedArray to Uint8Array
    value = Bufferish.Uint8Array.from(value);
  } else if (Bufferish.isArrayBuffer(value)) {
    // ArrayBuffer to Uint8Array
    value = new Uint8Array(value);
  } else if (typeof value === "string") {
    // String to Array
    return Bufferish.from.call(_exports, value);
  } else if (typeof value === "number") {
    throw new TypeError('"value" argument must not be a number');
  }

  // Array-like to Array
  return Array.prototype.slice.call(value);
}
},{"./bufferish":46}],43:[function(require,module,exports){
"use strict";

// bufferish-buffer.js

var Bufferish = require("./bufferish");
var Buffer = Bufferish.global;
var _exports = module.exports = Bufferish.hasBuffer ? alloc(0) : [];
_exports.alloc = Bufferish.hasBuffer && Buffer.alloc || alloc;
_exports.concat = Bufferish.concat;
_exports.from = from;

/**
 * @param size {Number}
 * @returns {Buffer|Uint8Array|Array}
 */

function alloc(size) {
  return new Buffer(size);
}

/**
 * @param value {Array|ArrayBuffer|Buffer|String}
 * @returns {Buffer}
 */

function from(value) {
  if (!Bufferish.isBuffer(value) && Bufferish.isView(value)) {
    // TypedArray to Uint8Array
    value = Bufferish.Uint8Array.from(value);
  } else if (Bufferish.isArrayBuffer(value)) {
    // ArrayBuffer to Uint8Array
    value = new Uint8Array(value);
  } else if (typeof value === "string") {
    // String to Buffer
    return Bufferish.from.call(_exports, value);
  } else if (typeof value === "number") {
    throw new TypeError('"value" argument must not be a number');
  }

  // Array-like to Buffer
  if (Buffer.from && Buffer.from.length !== 1) {
    return Buffer.from(value); // node v6+
  } else {
    return new Buffer(value); // node v4
  }
}
},{"./bufferish":46}],44:[function(require,module,exports){
"use strict";

// bufferish-proto.js

/* jshint eqnull:true */

var BufferLite = require("./buffer-lite");
exports.copy = copy;
exports.slice = slice;
exports.toString = toString;
exports.write = gen("write");
var Bufferish = require("./bufferish");
var Buffer = Bufferish.global;
var isBufferShim = Bufferish.hasBuffer && "TYPED_ARRAY_SUPPORT" in Buffer;
var brokenTypedArray = isBufferShim && !Buffer.TYPED_ARRAY_SUPPORT;

/**
 * @param target {Buffer|Uint8Array|Array}
 * @param [targetStart] {Number}
 * @param [start] {Number}
 * @param [end] {Number}
 * @returns {Buffer|Uint8Array|Array}
 */

function copy(target, targetStart, start, end) {
  var thisIsBuffer = Bufferish.isBuffer(this);
  var targetIsBuffer = Bufferish.isBuffer(target);
  if (thisIsBuffer && targetIsBuffer) {
    // Buffer to Buffer
    return this.copy(target, targetStart, start, end);
  } else if (!brokenTypedArray && !thisIsBuffer && !targetIsBuffer && Bufferish.isView(this) && Bufferish.isView(target)) {
    // Uint8Array to Uint8Array (except for minor some browsers)
    var buffer = start || end != null ? slice.call(this, start, end) : this;
    target.set(buffer, targetStart);
    return buffer.length;
  } else {
    // other cases
    return BufferLite.copy.call(this, target, targetStart, start, end);
  }
}

/**
 * @param [start] {Number}
 * @param [end] {Number}
 * @returns {Buffer|Uint8Array|Array}
 */

function slice(start, end) {
  // for Buffer, Uint8Array (except for minor some browsers) and Array
  var f = this.slice || !brokenTypedArray && this.subarray;
  if (f) return f.call(this, start, end);

  // Uint8Array (for minor some browsers)
  var target = Bufferish.alloc.call(this, end - start);
  copy.call(this, target, 0, start, end);
  return target;
}

/**
 * Buffer.prototype.toString()
 *
 * @param [encoding] {String} ignored
 * @param [start] {Number}
 * @param [end] {Number}
 * @returns {String}
 */

function toString(encoding, start, end) {
  var f = !isBufferShim && Bufferish.isBuffer(this) ? this.toString : BufferLite.toString;
  return f.apply(this, arguments);
}

/**
 * @private
 */

function gen(method) {
  return wrap;
  function wrap() {
    var f = this[method] || BufferLite[method];
    return f.apply(this, arguments);
  }
}
},{"./buffer-lite":41,"./bufferish":46}],45:[function(require,module,exports){
"use strict";

// bufferish-uint8array.js

var Bufferish = require("./bufferish");
var _exports = module.exports = Bufferish.hasArrayBuffer ? alloc(0) : [];
_exports.alloc = alloc;
_exports.concat = Bufferish.concat;
_exports.from = from;

/**
 * @param size {Number}
 * @returns {Buffer|Uint8Array|Array}
 */

function alloc(size) {
  return new Uint8Array(size);
}

/**
 * @param value {Array|ArrayBuffer|Buffer|String}
 * @returns {Uint8Array}
 */

function from(value) {
  if (Bufferish.isView(value)) {
    // TypedArray to ArrayBuffer
    var byteOffset = value.byteOffset;
    var byteLength = value.byteLength;
    value = value.buffer;
    if (value.byteLength !== byteLength) {
      if (value.slice) {
        value = value.slice(byteOffset, byteOffset + byteLength);
      } else {
        // Android 4.1 does not have ArrayBuffer.prototype.slice
        value = new Uint8Array(value);
        if (value.byteLength !== byteLength) {
          // TypedArray to ArrayBuffer to Uint8Array to Array
          value = Array.prototype.slice.call(value, byteOffset, byteOffset + byteLength);
        }
      }
    }
  } else if (typeof value === "string") {
    // String to Uint8Array
    return Bufferish.from.call(_exports, value);
  } else if (typeof value === "number") {
    throw new TypeError('"value" argument must not be a number');
  }
  return new Uint8Array(value);
}
},{"./bufferish":46}],46:[function(require,module,exports){
"use strict";

// bufferish.js

var Buffer = exports.global = require("./buffer-global");
var hasBuffer = exports.hasBuffer = Buffer && !!Buffer.isBuffer;
var hasArrayBuffer = exports.hasArrayBuffer = "undefined" !== typeof ArrayBuffer;
var isArray = exports.isArray = require("isarray");
exports.isArrayBuffer = hasArrayBuffer ? isArrayBuffer : _false;
var isBuffer = exports.isBuffer = hasBuffer ? Buffer.isBuffer : _false;
var isView = exports.isView = hasArrayBuffer ? ArrayBuffer.isView || _is("ArrayBuffer", "buffer") : _false;
exports.alloc = alloc;
exports.concat = concat;
exports.from = from;
var BufferArray = exports.Array = require("./bufferish-array");
var BufferBuffer = exports.Buffer = require("./bufferish-buffer");
var BufferUint8Array = exports.Uint8Array = require("./bufferish-uint8array");
var BufferProto = exports.prototype = require("./bufferish-proto");

/**
 * @param value {Array|ArrayBuffer|Buffer|String}
 * @returns {Buffer|Uint8Array|Array}
 */

function from(value) {
  if (typeof value === "string") {
    return fromString.call(this, value);
  } else {
    return auto(this).from(value);
  }
}

/**
 * @param size {Number}
 * @returns {Buffer|Uint8Array|Array}
 */

function alloc(size) {
  return auto(this).alloc(size);
}

/**
 * @param list {Array} array of (Buffer|Uint8Array|Array)s
 * @param [length]
 * @returns {Buffer|Uint8Array|Array}
 */

function concat(list, length) {
  if (!length) {
    length = 0;
    Array.prototype.forEach.call(list, dryrun);
  }
  var ref = this !== exports && this || list[0];
  var result = alloc.call(ref, length);
  var offset = 0;
  Array.prototype.forEach.call(list, append);
  return result;
  function dryrun(buffer) {
    length += buffer.length;
  }
  function append(buffer) {
    offset += BufferProto.copy.call(buffer, result, offset);
  }
}
var _isArrayBuffer = _is("ArrayBuffer");
function isArrayBuffer(value) {
  return value instanceof ArrayBuffer || _isArrayBuffer(value);
}

/**
 * @private
 */

function fromString(value) {
  var expected = value.length * 3;
  var that = alloc.call(this, expected);
  var actual = BufferProto.write.call(that, value);
  if (expected !== actual) {
    that = BufferProto.slice.call(that, 0, actual);
  }
  return that;
}
function auto(that) {
  return isBuffer(that) ? BufferBuffer : isView(that) ? BufferUint8Array : isArray(that) ? BufferArray : hasBuffer ? BufferBuffer : hasArrayBuffer ? BufferUint8Array : BufferArray;
}
function _false() {
  return false;
}
function _is(name, key) {
  /* jshint eqnull:true */
  name = "[object " + name + "]";
  return function (value) {
    return value != null && {}.toString.call(key ? value[key] : value) === name;
  };
}
},{"./buffer-global":40,"./bufferish-array":42,"./bufferish-buffer":43,"./bufferish-proto":44,"./bufferish-uint8array":45,"isarray":38}],47:[function(require,module,exports){
"use strict";

// codec-base.js

var IS_ARRAY = require("isarray");
exports.createCodec = createCodec;
exports.install = install;
exports.filter = filter;
var Bufferish = require("./bufferish");
function Codec(options) {
  if (!(this instanceof Codec)) return new Codec(options);
  this.options = options;
  this.init();
}
Codec.prototype.init = function () {
  var options = this.options;
  if (options && options.uint8array) {
    this.bufferish = Bufferish.Uint8Array;
  }
  return this;
};
function install(props) {
  for (var key in props) {
    Codec.prototype[key] = add(Codec.prototype[key], props[key]);
  }
}
function add(a, b) {
  return a && b ? ab : a || b;
  function ab() {
    a.apply(this, arguments);
    return b.apply(this, arguments);
  }
}
function join(filters) {
  filters = filters.slice();
  return function (value) {
    return filters.reduce(iterator, value);
  };
  function iterator(value, filter) {
    return filter(value);
  }
}
function filter(filter) {
  return IS_ARRAY(filter) ? join(filter) : filter;
}

// @public
// msgpack.createCodec()

function createCodec(options) {
  return new Codec(options);
}

// default shared codec

exports.preset = createCodec({
  preset: true
});
},{"./bufferish":46,"isarray":38}],48:[function(require,module,exports){
"use strict";

// codec.js

// load both interfaces
require("./read-core");
require("./write-core");

// @public
// msgpack.codec.preset

exports.codec = {
  preset: require("./codec-base").preset
};
},{"./codec-base":47,"./read-core":60,"./write-core":63}],49:[function(require,module,exports){
"use strict";

// decode-buffer.js

exports.DecodeBuffer = DecodeBuffer;
var preset = require("./read-core").preset;
var FlexDecoder = require("./flex-buffer").FlexDecoder;
FlexDecoder.mixin(DecodeBuffer.prototype);
function DecodeBuffer(options) {
  if (!(this instanceof DecodeBuffer)) return new DecodeBuffer(options);
  if (options) {
    this.options = options;
    if (options.codec) {
      var codec = this.codec = options.codec;
      if (codec.bufferish) this.bufferish = codec.bufferish;
    }
  }
}
DecodeBuffer.prototype.codec = preset;
DecodeBuffer.prototype.fetch = function () {
  return this.codec.decode(this);
};
},{"./flex-buffer":59,"./read-core":60}],50:[function(require,module,exports){
"use strict";

// decode.js

exports.decode = decode;
var DecodeBuffer = require("./decode-buffer").DecodeBuffer;
function decode(input, options) {
  var decoder = new DecodeBuffer(options);
  decoder.write(input);
  return decoder.read();
}
},{"./decode-buffer":49}],51:[function(require,module,exports){
"use strict";

// decoder.js

exports.Decoder = Decoder;
var EventLite = require("event-lite");
var DecodeBuffer = require("./decode-buffer").DecodeBuffer;
function Decoder(options) {
  if (!(this instanceof Decoder)) return new Decoder(options);
  DecodeBuffer.call(this, options);
}
Decoder.prototype = new DecodeBuffer();
EventLite.mixin(Decoder.prototype);
Decoder.prototype.decode = function (chunk) {
  if (arguments.length) this.write(chunk);
  this.flush();
};
Decoder.prototype.push = function (chunk) {
  this.emit("data", chunk);
};
Decoder.prototype.end = function (chunk) {
  this.decode(chunk);
  this.emit("end");
};
},{"./decode-buffer":49,"event-lite":35}],52:[function(require,module,exports){
"use strict";

// encode-buffer.js

exports.EncodeBuffer = EncodeBuffer;
var preset = require("./write-core").preset;
var FlexEncoder = require("./flex-buffer").FlexEncoder;
FlexEncoder.mixin(EncodeBuffer.prototype);
function EncodeBuffer(options) {
  if (!(this instanceof EncodeBuffer)) return new EncodeBuffer(options);
  if (options) {
    this.options = options;
    if (options.codec) {
      var codec = this.codec = options.codec;
      if (codec.bufferish) this.bufferish = codec.bufferish;
    }
  }
}
EncodeBuffer.prototype.codec = preset;
EncodeBuffer.prototype.write = function (input) {
  this.codec.encode(this, input);
};
},{"./flex-buffer":59,"./write-core":63}],53:[function(require,module,exports){
"use strict";

// encode.js

exports.encode = encode;
var EncodeBuffer = require("./encode-buffer").EncodeBuffer;
function encode(input, options) {
  var encoder = new EncodeBuffer(options);
  encoder.write(input);
  return encoder.read();
}
},{"./encode-buffer":52}],54:[function(require,module,exports){
"use strict";

// encoder.js

exports.Encoder = Encoder;
var EventLite = require("event-lite");
var EncodeBuffer = require("./encode-buffer").EncodeBuffer;
function Encoder(options) {
  if (!(this instanceof Encoder)) return new Encoder(options);
  EncodeBuffer.call(this, options);
}
Encoder.prototype = new EncodeBuffer();
EventLite.mixin(Encoder.prototype);
Encoder.prototype.encode = function (chunk) {
  this.write(chunk);
  this.emit("data", this.read());
};
Encoder.prototype.end = function (chunk) {
  if (arguments.length) this.encode(chunk);
  this.flush();
  this.emit("end");
};
},{"./encode-buffer":52,"event-lite":35}],55:[function(require,module,exports){
"use strict";

// ext-buffer.js

exports.ExtBuffer = ExtBuffer;
var Bufferish = require("./bufferish");
function ExtBuffer(buffer, type) {
  if (!(this instanceof ExtBuffer)) return new ExtBuffer(buffer, type);
  this.buffer = Bufferish.from(buffer);
  this.type = type;
}
},{"./bufferish":46}],56:[function(require,module,exports){
"use strict";

// ext-packer.js

exports.setExtPackers = setExtPackers;
var Bufferish = require("./bufferish");
var Buffer = Bufferish.global;
var packTypedArray = Bufferish.Uint8Array.from;
var _encode;
var ERROR_COLUMNS = {
  name: 1,
  message: 1,
  stack: 1,
  columnNumber: 1,
  fileName: 1,
  lineNumber: 1
};
function setExtPackers(codec) {
  codec.addExtPacker(0x0E, Error, [packError, encode]);
  codec.addExtPacker(0x01, EvalError, [packError, encode]);
  codec.addExtPacker(0x02, RangeError, [packError, encode]);
  codec.addExtPacker(0x03, ReferenceError, [packError, encode]);
  codec.addExtPacker(0x04, SyntaxError, [packError, encode]);
  codec.addExtPacker(0x05, TypeError, [packError, encode]);
  codec.addExtPacker(0x06, URIError, [packError, encode]);
  codec.addExtPacker(0x0A, RegExp, [packRegExp, encode]);
  codec.addExtPacker(0x0B, Boolean, [packValueOf, encode]);
  codec.addExtPacker(0x0C, String, [packValueOf, encode]);
  codec.addExtPacker(0x0D, Date, [Number, encode]);
  codec.addExtPacker(0x0F, Number, [packValueOf, encode]);
  if ("undefined" !== typeof Uint8Array) {
    codec.addExtPacker(0x11, Int8Array, packTypedArray);
    codec.addExtPacker(0x12, Uint8Array, packTypedArray);
    codec.addExtPacker(0x13, Int16Array, packTypedArray);
    codec.addExtPacker(0x14, Uint16Array, packTypedArray);
    codec.addExtPacker(0x15, Int32Array, packTypedArray);
    codec.addExtPacker(0x16, Uint32Array, packTypedArray);
    codec.addExtPacker(0x17, Float32Array, packTypedArray);

    // PhantomJS/1.9.7 doesn't have Float64Array
    if ("undefined" !== typeof Float64Array) {
      codec.addExtPacker(0x18, Float64Array, packTypedArray);
    }

    // IE10 doesn't have Uint8ClampedArray
    if ("undefined" !== typeof Uint8ClampedArray) {
      codec.addExtPacker(0x19, Uint8ClampedArray, packTypedArray);
    }
    codec.addExtPacker(0x1A, ArrayBuffer, packTypedArray);
    codec.addExtPacker(0x1D, DataView, packTypedArray);
  }
  if (Bufferish.hasBuffer) {
    codec.addExtPacker(0x1B, Buffer, Bufferish.from);
  }
}
function encode(input) {
  if (!_encode) _encode = require("./encode").encode; // lazy load
  return _encode(input);
}
function packValueOf(value) {
  return value.valueOf();
}
function packRegExp(value) {
  value = RegExp.prototype.toString.call(value).split("/");
  value.shift();
  var out = [value.pop()];
  out.unshift(value.join("/"));
  return out;
}
function packError(value) {
  var out = {};
  for (var key in ERROR_COLUMNS) {
    out[key] = value[key];
  }
  return out;
}
},{"./bufferish":46,"./encode":53}],57:[function(require,module,exports){
"use strict";

// ext-unpacker.js

exports.setExtUnpackers = setExtUnpackers;
var Bufferish = require("./bufferish");
var Buffer = Bufferish.global;
var _decode;
var ERROR_COLUMNS = {
  name: 1,
  message: 1,
  stack: 1,
  columnNumber: 1,
  fileName: 1,
  lineNumber: 1
};
function setExtUnpackers(codec) {
  codec.addExtUnpacker(0x0E, [decode, unpackError(Error)]);
  codec.addExtUnpacker(0x01, [decode, unpackError(EvalError)]);
  codec.addExtUnpacker(0x02, [decode, unpackError(RangeError)]);
  codec.addExtUnpacker(0x03, [decode, unpackError(ReferenceError)]);
  codec.addExtUnpacker(0x04, [decode, unpackError(SyntaxError)]);
  codec.addExtUnpacker(0x05, [decode, unpackError(TypeError)]);
  codec.addExtUnpacker(0x06, [decode, unpackError(URIError)]);
  codec.addExtUnpacker(0x0A, [decode, unpackRegExp]);
  codec.addExtUnpacker(0x0B, [decode, unpackClass(Boolean)]);
  codec.addExtUnpacker(0x0C, [decode, unpackClass(String)]);
  codec.addExtUnpacker(0x0D, [decode, unpackClass(Date)]);
  codec.addExtUnpacker(0x0F, [decode, unpackClass(Number)]);
  if ("undefined" !== typeof Uint8Array) {
    codec.addExtUnpacker(0x11, unpackClass(Int8Array));
    codec.addExtUnpacker(0x12, unpackClass(Uint8Array));
    codec.addExtUnpacker(0x13, [unpackArrayBuffer, unpackClass(Int16Array)]);
    codec.addExtUnpacker(0x14, [unpackArrayBuffer, unpackClass(Uint16Array)]);
    codec.addExtUnpacker(0x15, [unpackArrayBuffer, unpackClass(Int32Array)]);
    codec.addExtUnpacker(0x16, [unpackArrayBuffer, unpackClass(Uint32Array)]);
    codec.addExtUnpacker(0x17, [unpackArrayBuffer, unpackClass(Float32Array)]);

    // PhantomJS/1.9.7 doesn't have Float64Array
    if ("undefined" !== typeof Float64Array) {
      codec.addExtUnpacker(0x18, [unpackArrayBuffer, unpackClass(Float64Array)]);
    }

    // IE10 doesn't have Uint8ClampedArray
    if ("undefined" !== typeof Uint8ClampedArray) {
      codec.addExtUnpacker(0x19, unpackClass(Uint8ClampedArray));
    }
    codec.addExtUnpacker(0x1A, unpackArrayBuffer);
    codec.addExtUnpacker(0x1D, [unpackArrayBuffer, unpackClass(DataView)]);
  }
  if (Bufferish.hasBuffer) {
    codec.addExtUnpacker(0x1B, unpackClass(Buffer));
  }
}
function decode(input) {
  if (!_decode) _decode = require("./decode").decode; // lazy load
  return _decode(input);
}
function unpackRegExp(value) {
  return RegExp.apply(null, value);
}
function unpackError(Class) {
  return function (value) {
    var out = new Class();
    for (var key in ERROR_COLUMNS) {
      out[key] = value[key];
    }
    return out;
  };
}
function unpackClass(Class) {
  return function (value) {
    return new Class(value);
  };
}
function unpackArrayBuffer(value) {
  return new Uint8Array(value).buffer;
}
},{"./bufferish":46,"./decode":50}],58:[function(require,module,exports){
"use strict";

// ext.js

// load both interfaces
require("./read-core");
require("./write-core");
exports.createCodec = require("./codec-base").createCodec;
},{"./codec-base":47,"./read-core":60,"./write-core":63}],59:[function(require,module,exports){
"use strict";

// flex-buffer.js

exports.FlexDecoder = FlexDecoder;
exports.FlexEncoder = FlexEncoder;
var Bufferish = require("./bufferish");
var MIN_BUFFER_SIZE = 2048;
var MAX_BUFFER_SIZE = 65536;
var BUFFER_SHORTAGE = "BUFFER_SHORTAGE";
function FlexDecoder() {
  if (!(this instanceof FlexDecoder)) return new FlexDecoder();
}
function FlexEncoder() {
  if (!(this instanceof FlexEncoder)) return new FlexEncoder();
}
FlexDecoder.mixin = mixinFactory(getDecoderMethods());
FlexDecoder.mixin(FlexDecoder.prototype);
FlexEncoder.mixin = mixinFactory(getEncoderMethods());
FlexEncoder.mixin(FlexEncoder.prototype);
function getDecoderMethods() {
  return {
    bufferish: Bufferish,
    write: write,
    fetch: fetch,
    flush: flush,
    push: push,
    pull: pull,
    read: read,
    reserve: reserve,
    offset: 0
  };
  function write(chunk) {
    var prev = this.offset ? Bufferish.prototype.slice.call(this.buffer, this.offset) : this.buffer;
    this.buffer = prev ? chunk ? this.bufferish.concat([prev, chunk]) : prev : chunk;
    this.offset = 0;
  }
  function flush() {
    while (this.offset < this.buffer.length) {
      var start = this.offset;
      var value;
      try {
        value = this.fetch();
      } catch (e) {
        if (e && e.message != BUFFER_SHORTAGE) throw e;
        // rollback
        this.offset = start;
        break;
      }
      this.push(value);
    }
  }
  function reserve(length) {
    var start = this.offset;
    var end = start + length;
    if (end > this.buffer.length) throw new Error(BUFFER_SHORTAGE);
    this.offset = end;
    return start;
  }
}
function getEncoderMethods() {
  return {
    bufferish: Bufferish,
    write: write,
    fetch: fetch,
    flush: flush,
    push: push,
    pull: pull,
    read: read,
    reserve: reserve,
    send: send,
    maxBufferSize: MAX_BUFFER_SIZE,
    minBufferSize: MIN_BUFFER_SIZE,
    offset: 0,
    start: 0
  };
  function fetch() {
    var start = this.start;
    if (start < this.offset) {
      var end = this.start = this.offset;
      return Bufferish.prototype.slice.call(this.buffer, start, end);
    }
  }
  function flush() {
    while (this.start < this.offset) {
      var value = this.fetch();
      if (value) this.push(value);
    }
  }
  function pull() {
    var buffers = this.buffers || (this.buffers = []);
    var chunk = buffers.length > 1 ? this.bufferish.concat(buffers) : buffers[0];
    buffers.length = 0; // buffer exhausted
    return chunk;
  }
  function reserve(length) {
    var req = length | 0;
    if (this.buffer) {
      var size = this.buffer.length;
      var start = this.offset | 0;
      var end = start + req;

      // is it long enough?
      if (end < size) {
        this.offset = end;
        return start;
      }

      // flush current buffer
      this.flush();

      // resize it to 2x current length
      length = Math.max(length, Math.min(size * 2, this.maxBufferSize));
    }

    // minimum buffer size
    length = Math.max(length, this.minBufferSize);

    // allocate new buffer
    this.buffer = this.bufferish.alloc(length);
    this.start = 0;
    this.offset = req;
    return 0;
  }
  function send(buffer) {
    var length = buffer.length;
    if (length > this.minBufferSize) {
      this.flush();
      this.push(buffer);
    } else {
      var offset = this.reserve(length);
      Bufferish.prototype.copy.call(buffer, this.buffer, offset);
    }
  }
}

// common methods

function write() {
  throw new Error("method not implemented: write()");
}
function fetch() {
  throw new Error("method not implemented: fetch()");
}
function read() {
  var length = this.buffers && this.buffers.length;

  // fetch the first result
  if (!length) return this.fetch();

  // flush current buffer
  this.flush();

  // read from the results
  return this.pull();
}
function push(chunk) {
  var buffers = this.buffers || (this.buffers = []);
  buffers.push(chunk);
}
function pull() {
  var buffers = this.buffers || (this.buffers = []);
  return buffers.shift();
}
function mixinFactory(source) {
  return mixin;
  function mixin(target) {
    for (var key in source) {
      target[key] = source[key];
    }
    return target;
  }
}
},{"./bufferish":46}],60:[function(require,module,exports){
"use strict";

// read-core.js

var ExtBuffer = require("./ext-buffer").ExtBuffer;
var ExtUnpacker = require("./ext-unpacker");
var readUint8 = require("./read-format").readUint8;
var ReadToken = require("./read-token");
var CodecBase = require("./codec-base");
CodecBase.install({
  addExtUnpacker: addExtUnpacker,
  getExtUnpacker: getExtUnpacker,
  init: init
});
exports.preset = init.call(CodecBase.preset);
function getDecoder(options) {
  var readToken = ReadToken.getReadToken(options);
  return decode;
  function decode(decoder) {
    var type = readUint8(decoder);
    var func = readToken[type];
    if (!func) throw new Error("Invalid type: " + (type ? "0x" + type.toString(16) : type));
    return func(decoder);
  }
}
function init() {
  var options = this.options;
  this.decode = getDecoder(options);
  if (options && options.preset) {
    ExtUnpacker.setExtUnpackers(this);
  }
  return this;
}
function addExtUnpacker(etype, unpacker) {
  var unpackers = this.extUnpackers || (this.extUnpackers = []);
  unpackers[etype] = CodecBase.filter(unpacker);
}
function getExtUnpacker(type) {
  var unpackers = this.extUnpackers || (this.extUnpackers = []);
  return unpackers[type] || extUnpacker;
  function extUnpacker(buffer) {
    return new ExtBuffer(buffer, type);
  }
}
},{"./codec-base":47,"./ext-buffer":55,"./ext-unpacker":57,"./read-format":61,"./read-token":62}],61:[function(require,module,exports){
"use strict";

// read-format.js

var ieee754 = require("ieee754");
var Int64Buffer = require("int64-buffer");
var Uint64BE = Int64Buffer.Uint64BE;
var Int64BE = Int64Buffer.Int64BE;
exports.getReadFormat = getReadFormat;
exports.readUint8 = uint8;
var Bufferish = require("./bufferish");
var BufferProto = require("./bufferish-proto");
var HAS_MAP = "undefined" !== typeof Map;
var NO_ASSERT = true;
function getReadFormat(options) {
  var binarraybuffer = Bufferish.hasArrayBuffer && options && options.binarraybuffer;
  var int64 = options && options.int64;
  var usemap = HAS_MAP && options && options.usemap;
  var readFormat = {
    map: usemap ? map_to_map : map_to_obj,
    array: array,
    str: str,
    bin: binarraybuffer ? bin_arraybuffer : bin_buffer,
    ext: ext,
    uint8: uint8,
    uint16: uint16,
    uint32: uint32,
    uint64: read(8, int64 ? readUInt64BE_int64 : readUInt64BE),
    int8: int8,
    int16: int16,
    int32: int32,
    int64: read(8, int64 ? readInt64BE_int64 : readInt64BE),
    float32: read(4, readFloatBE),
    float64: read(8, readDoubleBE)
  };
  return readFormat;
}
function map_to_obj(decoder, len) {
  var value = {};
  var i;
  var k = new Array(len);
  var v = new Array(len);
  var decode = decoder.codec.decode;
  for (i = 0; i < len; i++) {
    k[i] = decode(decoder);
    v[i] = decode(decoder);
  }
  for (i = 0; i < len; i++) {
    value[k[i]] = v[i];
  }
  return value;
}
function map_to_map(decoder, len) {
  var value = new Map();
  var i;
  var k = new Array(len);
  var v = new Array(len);
  var decode = decoder.codec.decode;
  for (i = 0; i < len; i++) {
    k[i] = decode(decoder);
    v[i] = decode(decoder);
  }
  for (i = 0; i < len; i++) {
    value.set(k[i], v[i]);
  }
  return value;
}
function array(decoder, len) {
  var value = new Array(len);
  var decode = decoder.codec.decode;
  for (var i = 0; i < len; i++) {
    value[i] = decode(decoder);
  }
  return value;
}
function str(decoder, len) {
  var start = decoder.reserve(len);
  var end = start + len;
  return BufferProto.toString.call(decoder.buffer, "utf-8", start, end);
}
function bin_buffer(decoder, len) {
  var start = decoder.reserve(len);
  var end = start + len;
  var buf = BufferProto.slice.call(decoder.buffer, start, end);
  return Bufferish.from(buf);
}
function bin_arraybuffer(decoder, len) {
  var start = decoder.reserve(len);
  var end = start + len;
  var buf = BufferProto.slice.call(decoder.buffer, start, end);
  return Bufferish.Uint8Array.from(buf).buffer;
}
function ext(decoder, len) {
  var start = decoder.reserve(len + 1);
  var type = decoder.buffer[start++];
  var end = start + len;
  var unpack = decoder.codec.getExtUnpacker(type);
  if (!unpack) throw new Error("Invalid ext type: " + (type ? "0x" + type.toString(16) : type));
  var buf = BufferProto.slice.call(decoder.buffer, start, end);
  return unpack(buf);
}
function uint8(decoder) {
  var start = decoder.reserve(1);
  return decoder.buffer[start];
}
function int8(decoder) {
  var start = decoder.reserve(1);
  var value = decoder.buffer[start];
  return value & 0x80 ? value - 0x100 : value;
}
function uint16(decoder) {
  var start = decoder.reserve(2);
  var buffer = decoder.buffer;
  return buffer[start++] << 8 | buffer[start];
}
function int16(decoder) {
  var start = decoder.reserve(2);
  var buffer = decoder.buffer;
  var value = buffer[start++] << 8 | buffer[start];
  return value & 0x8000 ? value - 0x10000 : value;
}
function uint32(decoder) {
  var start = decoder.reserve(4);
  var buffer = decoder.buffer;
  return buffer[start++] * 16777216 + (buffer[start++] << 16) + (buffer[start++] << 8) + buffer[start];
}
function int32(decoder) {
  var start = decoder.reserve(4);
  var buffer = decoder.buffer;
  return buffer[start++] << 24 | buffer[start++] << 16 | buffer[start++] << 8 | buffer[start];
}
function read(len, method) {
  return function (decoder) {
    var start = decoder.reserve(len);
    return method.call(decoder.buffer, start, NO_ASSERT);
  };
}
function readUInt64BE(start) {
  return new Uint64BE(this, start).toNumber();
}
function readInt64BE(start) {
  return new Int64BE(this, start).toNumber();
}
function readUInt64BE_int64(start) {
  return new Uint64BE(this, start);
}
function readInt64BE_int64(start) {
  return new Int64BE(this, start);
}
function readFloatBE(start) {
  return ieee754.read(this, start, false, 23, 4);
}
function readDoubleBE(start) {
  return ieee754.read(this, start, false, 52, 8);
}
},{"./bufferish":46,"./bufferish-proto":44,"ieee754":36,"int64-buffer":37}],62:[function(require,module,exports){
"use strict";

// read-token.js

var ReadFormat = require("./read-format");
exports.getReadToken = getReadToken;
function getReadToken(options) {
  var format = ReadFormat.getReadFormat(options);
  if (options && options.useraw) {
    return init_useraw(format);
  } else {
    return init_token(format);
  }
}
function init_token(format) {
  var i;
  var token = new Array(256);

  // positive fixint -- 0x00 - 0x7f
  for (i = 0x00; i <= 0x7f; i++) {
    token[i] = constant(i);
  }

  // fixmap -- 0x80 - 0x8f
  for (i = 0x80; i <= 0x8f; i++) {
    token[i] = fix(i - 0x80, format.map);
  }

  // fixarray -- 0x90 - 0x9f
  for (i = 0x90; i <= 0x9f; i++) {
    token[i] = fix(i - 0x90, format.array);
  }

  // fixstr -- 0xa0 - 0xbf
  for (i = 0xa0; i <= 0xbf; i++) {
    token[i] = fix(i - 0xa0, format.str);
  }

  // nil -- 0xc0
  token[0xc0] = constant(null);

  // (never used) -- 0xc1
  token[0xc1] = null;

  // false -- 0xc2
  // true -- 0xc3
  token[0xc2] = constant(false);
  token[0xc3] = constant(true);

  // bin 8 -- 0xc4
  // bin 16 -- 0xc5
  // bin 32 -- 0xc6
  token[0xc4] = flex(format.uint8, format.bin);
  token[0xc5] = flex(format.uint16, format.bin);
  token[0xc6] = flex(format.uint32, format.bin);

  // ext 8 -- 0xc7
  // ext 16 -- 0xc8
  // ext 32 -- 0xc9
  token[0xc7] = flex(format.uint8, format.ext);
  token[0xc8] = flex(format.uint16, format.ext);
  token[0xc9] = flex(format.uint32, format.ext);

  // float 32 -- 0xca
  // float 64 -- 0xcb
  token[0xca] = format.float32;
  token[0xcb] = format.float64;

  // uint 8 -- 0xcc
  // uint 16 -- 0xcd
  // uint 32 -- 0xce
  // uint 64 -- 0xcf
  token[0xcc] = format.uint8;
  token[0xcd] = format.uint16;
  token[0xce] = format.uint32;
  token[0xcf] = format.uint64;

  // int 8 -- 0xd0
  // int 16 -- 0xd1
  // int 32 -- 0xd2
  // int 64 -- 0xd3
  token[0xd0] = format.int8;
  token[0xd1] = format.int16;
  token[0xd2] = format.int32;
  token[0xd3] = format.int64;

  // fixext 1 -- 0xd4
  // fixext 2 -- 0xd5
  // fixext 4 -- 0xd6
  // fixext 8 -- 0xd7
  // fixext 16 -- 0xd8
  token[0xd4] = fix(1, format.ext);
  token[0xd5] = fix(2, format.ext);
  token[0xd6] = fix(4, format.ext);
  token[0xd7] = fix(8, format.ext);
  token[0xd8] = fix(16, format.ext);

  // str 8 -- 0xd9
  // str 16 -- 0xda
  // str 32 -- 0xdb
  token[0xd9] = flex(format.uint8, format.str);
  token[0xda] = flex(format.uint16, format.str);
  token[0xdb] = flex(format.uint32, format.str);

  // array 16 -- 0xdc
  // array 32 -- 0xdd
  token[0xdc] = flex(format.uint16, format.array);
  token[0xdd] = flex(format.uint32, format.array);

  // map 16 -- 0xde
  // map 32 -- 0xdf
  token[0xde] = flex(format.uint16, format.map);
  token[0xdf] = flex(format.uint32, format.map);

  // negative fixint -- 0xe0 - 0xff
  for (i = 0xe0; i <= 0xff; i++) {
    token[i] = constant(i - 0x100);
  }
  return token;
}
function init_useraw(format) {
  var i;
  var token = init_token(format).slice();

  // raw 8 -- 0xd9
  // raw 16 -- 0xda
  // raw 32 -- 0xdb
  token[0xd9] = token[0xc4];
  token[0xda] = token[0xc5];
  token[0xdb] = token[0xc6];

  // fixraw -- 0xa0 - 0xbf
  for (i = 0xa0; i <= 0xbf; i++) {
    token[i] = fix(i - 0xa0, format.bin);
  }
  return token;
}
function constant(value) {
  return function () {
    return value;
  };
}
function flex(lenFunc, decodeFunc) {
  return function (decoder) {
    var len = lenFunc(decoder);
    return decodeFunc(decoder, len);
  };
}
function fix(len, method) {
  return function (decoder) {
    return method(decoder, len);
  };
}
},{"./read-format":61}],63:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
// write-core.js

var ExtBuffer = require("./ext-buffer").ExtBuffer;
var ExtPacker = require("./ext-packer");
var WriteType = require("./write-type");
var CodecBase = require("./codec-base");
CodecBase.install({
  addExtPacker: addExtPacker,
  getExtPacker: getExtPacker,
  init: init
});
exports.preset = init.call(CodecBase.preset);
function getEncoder(options) {
  var writeType = WriteType.getWriteType(options);
  return encode;
  function encode(encoder, value) {
    var func = writeType[_typeof(value)];
    if (!func) throw new Error("Unsupported type \"" + _typeof(value) + "\": " + value);
    func(encoder, value);
  }
}
function init() {
  var options = this.options;
  this.encode = getEncoder(options);
  if (options && options.preset) {
    ExtPacker.setExtPackers(this);
  }
  return this;
}
function addExtPacker(etype, Class, packer) {
  packer = CodecBase.filter(packer);
  var name = Class.name;
  if (name && name !== "Object") {
    var packers = this.extPackers || (this.extPackers = {});
    packers[name] = extPacker;
  } else {
    // fallback for IE
    var list = this.extEncoderList || (this.extEncoderList = []);
    list.unshift([Class, extPacker]);
  }
  function extPacker(value) {
    if (packer) value = packer(value);
    return new ExtBuffer(value, etype);
  }
}
function getExtPacker(value) {
  var packers = this.extPackers || (this.extPackers = {});
  var c = value.constructor;
  var e = c && c.name && packers[c.name];
  if (e) return e;

  // fallback for IE
  var list = this.extEncoderList || (this.extEncoderList = []);
  var len = list.length;
  for (var i = 0; i < len; i++) {
    var pair = list[i];
    if (c === pair[0]) return pair[1];
  }
}
},{"./codec-base":47,"./ext-buffer":55,"./ext-packer":56,"./write-type":65}],64:[function(require,module,exports){
"use strict";

// write-token.js

var ieee754 = require("ieee754");
var Int64Buffer = require("int64-buffer");
var Uint64BE = Int64Buffer.Uint64BE;
var Int64BE = Int64Buffer.Int64BE;
var uint8 = require("./write-uint8").uint8;
var Bufferish = require("./bufferish");
var Buffer = Bufferish.global;
var IS_BUFFER_SHIM = Bufferish.hasBuffer && "TYPED_ARRAY_SUPPORT" in Buffer;
var NO_TYPED_ARRAY = IS_BUFFER_SHIM && !Buffer.TYPED_ARRAY_SUPPORT;
var Buffer_prototype = Bufferish.hasBuffer && Buffer.prototype || {};
exports.getWriteToken = getWriteToken;
function getWriteToken(options) {
  if (options && options.uint8array) {
    return init_uint8array();
  } else if (NO_TYPED_ARRAY || Bufferish.hasBuffer && options && options.safe) {
    return init_safe();
  } else {
    return init_token();
  }
}
function init_uint8array() {
  var token = init_token();

  // float 32 -- 0xca
  // float 64 -- 0xcb
  token[0xca] = writeN(0xca, 4, writeFloatBE);
  token[0xcb] = writeN(0xcb, 8, writeDoubleBE);
  return token;
}

// Node.js and browsers with TypedArray

function init_token() {
  // (immediate values)
  // positive fixint -- 0x00 - 0x7f
  // nil -- 0xc0
  // false -- 0xc2
  // true -- 0xc3
  // negative fixint -- 0xe0 - 0xff
  var token = uint8.slice();

  // bin 8 -- 0xc4
  // bin 16 -- 0xc5
  // bin 32 -- 0xc6
  token[0xc4] = write1(0xc4);
  token[0xc5] = write2(0xc5);
  token[0xc6] = write4(0xc6);

  // ext 8 -- 0xc7
  // ext 16 -- 0xc8
  // ext 32 -- 0xc9
  token[0xc7] = write1(0xc7);
  token[0xc8] = write2(0xc8);
  token[0xc9] = write4(0xc9);

  // float 32 -- 0xca
  // float 64 -- 0xcb
  token[0xca] = writeN(0xca, 4, Buffer_prototype.writeFloatBE || writeFloatBE, true);
  token[0xcb] = writeN(0xcb, 8, Buffer_prototype.writeDoubleBE || writeDoubleBE, true);

  // uint 8 -- 0xcc
  // uint 16 -- 0xcd
  // uint 32 -- 0xce
  // uint 64 -- 0xcf
  token[0xcc] = write1(0xcc);
  token[0xcd] = write2(0xcd);
  token[0xce] = write4(0xce);
  token[0xcf] = writeN(0xcf, 8, writeUInt64BE);

  // int 8 -- 0xd0
  // int 16 -- 0xd1
  // int 32 -- 0xd2
  // int 64 -- 0xd3
  token[0xd0] = write1(0xd0);
  token[0xd1] = write2(0xd1);
  token[0xd2] = write4(0xd2);
  token[0xd3] = writeN(0xd3, 8, writeInt64BE);

  // str 8 -- 0xd9
  // str 16 -- 0xda
  // str 32 -- 0xdb
  token[0xd9] = write1(0xd9);
  token[0xda] = write2(0xda);
  token[0xdb] = write4(0xdb);

  // array 16 -- 0xdc
  // array 32 -- 0xdd
  token[0xdc] = write2(0xdc);
  token[0xdd] = write4(0xdd);

  // map 16 -- 0xde
  // map 32 -- 0xdf
  token[0xde] = write2(0xde);
  token[0xdf] = write4(0xdf);
  return token;
}

// safe mode: for old browsers and who needs asserts

function init_safe() {
  // (immediate values)
  // positive fixint -- 0x00 - 0x7f
  // nil -- 0xc0
  // false -- 0xc2
  // true -- 0xc3
  // negative fixint -- 0xe0 - 0xff
  var token = uint8.slice();

  // bin 8 -- 0xc4
  // bin 16 -- 0xc5
  // bin 32 -- 0xc6
  token[0xc4] = writeN(0xc4, 1, Buffer.prototype.writeUInt8);
  token[0xc5] = writeN(0xc5, 2, Buffer.prototype.writeUInt16BE);
  token[0xc6] = writeN(0xc6, 4, Buffer.prototype.writeUInt32BE);

  // ext 8 -- 0xc7
  // ext 16 -- 0xc8
  // ext 32 -- 0xc9
  token[0xc7] = writeN(0xc7, 1, Buffer.prototype.writeUInt8);
  token[0xc8] = writeN(0xc8, 2, Buffer.prototype.writeUInt16BE);
  token[0xc9] = writeN(0xc9, 4, Buffer.prototype.writeUInt32BE);

  // float 32 -- 0xca
  // float 64 -- 0xcb
  token[0xca] = writeN(0xca, 4, Buffer.prototype.writeFloatBE);
  token[0xcb] = writeN(0xcb, 8, Buffer.prototype.writeDoubleBE);

  // uint 8 -- 0xcc
  // uint 16 -- 0xcd
  // uint 32 -- 0xce
  // uint 64 -- 0xcf
  token[0xcc] = writeN(0xcc, 1, Buffer.prototype.writeUInt8);
  token[0xcd] = writeN(0xcd, 2, Buffer.prototype.writeUInt16BE);
  token[0xce] = writeN(0xce, 4, Buffer.prototype.writeUInt32BE);
  token[0xcf] = writeN(0xcf, 8, writeUInt64BE);

  // int 8 -- 0xd0
  // int 16 -- 0xd1
  // int 32 -- 0xd2
  // int 64 -- 0xd3
  token[0xd0] = writeN(0xd0, 1, Buffer.prototype.writeInt8);
  token[0xd1] = writeN(0xd1, 2, Buffer.prototype.writeInt16BE);
  token[0xd2] = writeN(0xd2, 4, Buffer.prototype.writeInt32BE);
  token[0xd3] = writeN(0xd3, 8, writeInt64BE);

  // str 8 -- 0xd9
  // str 16 -- 0xda
  // str 32 -- 0xdb
  token[0xd9] = writeN(0xd9, 1, Buffer.prototype.writeUInt8);
  token[0xda] = writeN(0xda, 2, Buffer.prototype.writeUInt16BE);
  token[0xdb] = writeN(0xdb, 4, Buffer.prototype.writeUInt32BE);

  // array 16 -- 0xdc
  // array 32 -- 0xdd
  token[0xdc] = writeN(0xdc, 2, Buffer.prototype.writeUInt16BE);
  token[0xdd] = writeN(0xdd, 4, Buffer.prototype.writeUInt32BE);

  // map 16 -- 0xde
  // map 32 -- 0xdf
  token[0xde] = writeN(0xde, 2, Buffer.prototype.writeUInt16BE);
  token[0xdf] = writeN(0xdf, 4, Buffer.prototype.writeUInt32BE);
  return token;
}
function write1(type) {
  return function (encoder, value) {
    var offset = encoder.reserve(2);
    var buffer = encoder.buffer;
    buffer[offset++] = type;
    buffer[offset] = value;
  };
}
function write2(type) {
  return function (encoder, value) {
    var offset = encoder.reserve(3);
    var buffer = encoder.buffer;
    buffer[offset++] = type;
    buffer[offset++] = value >>> 8;
    buffer[offset] = value;
  };
}
function write4(type) {
  return function (encoder, value) {
    var offset = encoder.reserve(5);
    var buffer = encoder.buffer;
    buffer[offset++] = type;
    buffer[offset++] = value >>> 24;
    buffer[offset++] = value >>> 16;
    buffer[offset++] = value >>> 8;
    buffer[offset] = value;
  };
}
function writeN(type, len, method, noAssert) {
  return function (encoder, value) {
    var offset = encoder.reserve(len + 1);
    encoder.buffer[offset++] = type;
    method.call(encoder.buffer, value, offset, noAssert);
  };
}
function writeUInt64BE(value, offset) {
  new Uint64BE(this, offset, value);
}
function writeInt64BE(value, offset) {
  new Int64BE(this, offset, value);
}
function writeFloatBE(value, offset) {
  ieee754.write(this, value, offset, false, 23, 4);
}
function writeDoubleBE(value, offset) {
  ieee754.write(this, value, offset, false, 52, 8);
}
},{"./bufferish":46,"./write-uint8":66,"ieee754":36,"int64-buffer":37}],65:[function(require,module,exports){
"use strict";

// write-type.js

var IS_ARRAY = require("isarray");
var Int64Buffer = require("int64-buffer");
var Uint64BE = Int64Buffer.Uint64BE;
var Int64BE = Int64Buffer.Int64BE;
var Bufferish = require("./bufferish");
var BufferProto = require("./bufferish-proto");
var WriteToken = require("./write-token");
var uint8 = require("./write-uint8").uint8;
var ExtBuffer = require("./ext-buffer").ExtBuffer;
var HAS_UINT8ARRAY = "undefined" !== typeof Uint8Array;
var HAS_MAP = "undefined" !== typeof Map;
var extmap = [];
extmap[1] = 0xd4;
extmap[2] = 0xd5;
extmap[4] = 0xd6;
extmap[8] = 0xd7;
extmap[16] = 0xd8;
exports.getWriteType = getWriteType;
function getWriteType(options) {
  var token = WriteToken.getWriteToken(options);
  var useraw = options && options.useraw;
  var binarraybuffer = HAS_UINT8ARRAY && options && options.binarraybuffer;
  var isBuffer = binarraybuffer ? Bufferish.isArrayBuffer : Bufferish.isBuffer;
  var bin = binarraybuffer ? bin_arraybuffer : bin_buffer;
  var usemap = HAS_MAP && options && options.usemap;
  var map = usemap ? map_to_map : obj_to_map;
  var writeType = {
    "boolean": bool,
    "function": nil,
    "number": number,
    "object": useraw ? object_raw : object,
    "string": _string(useraw ? raw_head_size : str_head_size),
    "symbol": nil,
    "undefined": nil
  };
  return writeType;

  // false -- 0xc2
  // true -- 0xc3
  function bool(encoder, value) {
    var type = value ? 0xc3 : 0xc2;
    token[type](encoder, value);
  }
  function number(encoder, value) {
    var ivalue = value | 0;
    var type;
    if (value !== ivalue) {
      // float 64 -- 0xcb
      type = 0xcb;
      token[type](encoder, value);
      return;
    } else if (-0x20 <= ivalue && ivalue <= 0x7F) {
      // positive fixint -- 0x00 - 0x7f
      // negative fixint -- 0xe0 - 0xff
      type = ivalue & 0xFF;
    } else if (0 <= ivalue) {
      // uint 8 -- 0xcc
      // uint 16 -- 0xcd
      // uint 32 -- 0xce
      type = ivalue <= 0xFF ? 0xcc : ivalue <= 0xFFFF ? 0xcd : 0xce;
    } else {
      // int 8 -- 0xd0
      // int 16 -- 0xd1
      // int 32 -- 0xd2
      type = -0x80 <= ivalue ? 0xd0 : -0x8000 <= ivalue ? 0xd1 : 0xd2;
    }
    token[type](encoder, ivalue);
  }

  // uint 64 -- 0xcf
  function uint64(encoder, value) {
    var type = 0xcf;
    token[type](encoder, value.toArray());
  }

  // int 64 -- 0xd3
  function int64(encoder, value) {
    var type = 0xd3;
    token[type](encoder, value.toArray());
  }

  // str 8 -- 0xd9
  // str 16 -- 0xda
  // str 32 -- 0xdb
  // fixstr -- 0xa0 - 0xbf
  function str_head_size(length) {
    return length < 32 ? 1 : length <= 0xFF ? 2 : length <= 0xFFFF ? 3 : 5;
  }

  // raw 16 -- 0xda
  // raw 32 -- 0xdb
  // fixraw -- 0xa0 - 0xbf
  function raw_head_size(length) {
    return length < 32 ? 1 : length <= 0xFFFF ? 3 : 5;
  }
  function _string(head_size) {
    return string;
    function string(encoder, value) {
      // prepare buffer
      var length = value.length;
      var maxsize = 5 + length * 3;
      encoder.offset = encoder.reserve(maxsize);
      var buffer = encoder.buffer;

      // expected header size
      var expected = head_size(length);

      // expected start point
      var start = encoder.offset + expected;

      // write string
      length = BufferProto.write.call(buffer, value, start);

      // actual header size
      var actual = head_size(length);

      // move content when needed
      if (expected !== actual) {
        var targetStart = start + actual - expected;
        var end = start + length;
        BufferProto.copy.call(buffer, buffer, targetStart, start, end);
      }

      // write header
      var type = actual === 1 ? 0xa0 + length : actual <= 3 ? 0xd7 + actual : 0xdb;
      token[type](encoder, length);

      // move cursor
      encoder.offset += length;
    }
  }
  function object(encoder, value) {
    // null
    if (value === null) return nil(encoder, value);

    // Buffer
    if (isBuffer(value)) return bin(encoder, value);

    // Array
    if (IS_ARRAY(value)) return array(encoder, value);

    // int64-buffer objects
    if (Uint64BE.isUint64BE(value)) return uint64(encoder, value);
    if (Int64BE.isInt64BE(value)) return int64(encoder, value);

    // ext formats
    var packer = encoder.codec.getExtPacker(value);
    if (packer) value = packer(value);
    if (value instanceof ExtBuffer) return ext(encoder, value);

    // plain old Objects or Map
    map(encoder, value);
  }
  function object_raw(encoder, value) {
    // Buffer
    if (isBuffer(value)) return raw(encoder, value);

    // others
    object(encoder, value);
  }

  // nil -- 0xc0
  function nil(encoder, value) {
    var type = 0xc0;
    token[type](encoder, value);
  }

  // fixarray -- 0x90 - 0x9f
  // array 16 -- 0xdc
  // array 32 -- 0xdd
  function array(encoder, value) {
    var length = value.length;
    var type = length < 16 ? 0x90 + length : length <= 0xFFFF ? 0xdc : 0xdd;
    token[type](encoder, length);
    var encode = encoder.codec.encode;
    for (var i = 0; i < length; i++) {
      encode(encoder, value[i]);
    }
  }

  // bin 8 -- 0xc4
  // bin 16 -- 0xc5
  // bin 32 -- 0xc6
  function bin_buffer(encoder, value) {
    var length = value.length;
    var type = length < 0xFF ? 0xc4 : length <= 0xFFFF ? 0xc5 : 0xc6;
    token[type](encoder, length);
    encoder.send(value);
  }
  function bin_arraybuffer(encoder, value) {
    bin_buffer(encoder, new Uint8Array(value));
  }

  // fixext 1 -- 0xd4
  // fixext 2 -- 0xd5
  // fixext 4 -- 0xd6
  // fixext 8 -- 0xd7
  // fixext 16 -- 0xd8
  // ext 8 -- 0xc7
  // ext 16 -- 0xc8
  // ext 32 -- 0xc9
  function ext(encoder, value) {
    var buffer = value.buffer;
    var length = buffer.length;
    var type = extmap[length] || (length < 0xFF ? 0xc7 : length <= 0xFFFF ? 0xc8 : 0xc9);
    token[type](encoder, length);
    uint8[value.type](encoder);
    encoder.send(buffer);
  }

  // fixmap -- 0x80 - 0x8f
  // map 16 -- 0xde
  // map 32 -- 0xdf
  function obj_to_map(encoder, value) {
    var keys = Object.keys(value);
    var length = keys.length;
    var type = length < 16 ? 0x80 + length : length <= 0xFFFF ? 0xde : 0xdf;
    token[type](encoder, length);
    var encode = encoder.codec.encode;
    keys.forEach(function (key) {
      encode(encoder, key);
      encode(encoder, value[key]);
    });
  }

  // fixmap -- 0x80 - 0x8f
  // map 16 -- 0xde
  // map 32 -- 0xdf
  function map_to_map(encoder, value) {
    if (!(value instanceof Map)) return obj_to_map(encoder, value);
    var length = value.size;
    var type = length < 16 ? 0x80 + length : length <= 0xFFFF ? 0xde : 0xdf;
    token[type](encoder, length);
    var encode = encoder.codec.encode;
    value.forEach(function (val, key, m) {
      encode(encoder, key);
      encode(encoder, val);
    });
  }

  // raw 16 -- 0xda
  // raw 32 -- 0xdb
  // fixraw -- 0xa0 - 0xbf
  function raw(encoder, value) {
    var length = value.length;
    var type = length < 32 ? 0xa0 + length : length <= 0xFFFF ? 0xda : 0xdb;
    token[type](encoder, length);
    encoder.send(value);
  }
}
},{"./bufferish":46,"./bufferish-proto":44,"./ext-buffer":55,"./write-token":64,"./write-uint8":66,"int64-buffer":37,"isarray":38}],66:[function(require,module,exports){
"use strict";

// write-unit8.js

var constant = exports.uint8 = new Array(256);
for (var i = 0x00; i <= 0xFF; i++) {
  constant[i] = write0(i);
}
function write0(type) {
  return function (encoder) {
    var offset = encoder.reserve(1);
    encoder.buffer[offset] = type;
  };
}
},{}],67:[function(require,module,exports){
"use strict";

// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;
function defaultSetTimout() {
  throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout() {
  throw new Error('clearTimeout has not been defined');
}
(function () {
  try {
    if (typeof setTimeout === 'function') {
      cachedSetTimeout = setTimeout;
    } else {
      cachedSetTimeout = defaultSetTimout;
    }
  } catch (e) {
    cachedSetTimeout = defaultSetTimout;
  }
  try {
    if (typeof clearTimeout === 'function') {
      cachedClearTimeout = clearTimeout;
    } else {
      cachedClearTimeout = defaultClearTimeout;
    }
  } catch (e) {
    cachedClearTimeout = defaultClearTimeout;
  }
})();
function runTimeout(fun) {
  if (cachedSetTimeout === setTimeout) {
    //normal enviroments in sane situations
    return setTimeout(fun, 0);
  }
  // if setTimeout wasn't available but was latter defined
  if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
    cachedSetTimeout = setTimeout;
    return setTimeout(fun, 0);
  }
  try {
    // when when somebody has screwed with setTimeout but no I.E. maddness
    return cachedSetTimeout(fun, 0);
  } catch (e) {
    try {
      // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
      return cachedSetTimeout.call(null, fun, 0);
    } catch (e) {
      // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
      return cachedSetTimeout.call(this, fun, 0);
    }
  }
}
function runClearTimeout(marker) {
  if (cachedClearTimeout === clearTimeout) {
    //normal enviroments in sane situations
    return clearTimeout(marker);
  }
  // if clearTimeout wasn't available but was latter defined
  if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
    cachedClearTimeout = clearTimeout;
    return clearTimeout(marker);
  }
  try {
    // when when somebody has screwed with setTimeout but no I.E. maddness
    return cachedClearTimeout(marker);
  } catch (e) {
    try {
      // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
      return cachedClearTimeout.call(null, marker);
    } catch (e) {
      // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
      // Some versions of I.E. have different rules for clearTimeout vs setTimeout
      return cachedClearTimeout.call(this, marker);
    }
  }
}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;
function cleanUpNextTick() {
  if (!draining || !currentQueue) {
    return;
  }
  draining = false;
  if (currentQueue.length) {
    queue = currentQueue.concat(queue);
  } else {
    queueIndex = -1;
  }
  if (queue.length) {
    drainQueue();
  }
}
function drainQueue() {
  if (draining) {
    return;
  }
  var timeout = runTimeout(cleanUpNextTick);
  draining = true;
  var len = queue.length;
  while (len) {
    currentQueue = queue;
    queue = [];
    while (++queueIndex < len) {
      if (currentQueue) {
        currentQueue[queueIndex].run();
      }
    }
    queueIndex = -1;
    len = queue.length;
  }
  currentQueue = null;
  draining = false;
  runClearTimeout(timeout);
}
process.nextTick = function (fun) {
  var args = new Array(arguments.length - 1);
  if (arguments.length > 1) {
    for (var i = 1; i < arguments.length; i++) {
      args[i - 1] = arguments[i];
    }
  }
  queue.push(new Item(fun, args));
  if (queue.length === 1 && !draining) {
    runTimeout(drainQueue);
  }
};

// v8 likes predictible objects
function Item(fun, array) {
  this.fun = fun;
  this.array = array;
}
Item.prototype.run = function () {
  this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};
function noop() {}
process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;
process.listeners = function (name) {
  return [];
};
process.binding = function (name) {
  throw new Error('process.binding is not supported');
};
process.cwd = function () {
  return '/';
};
process.chdir = function (dir) {
  throw new Error('process.chdir is not supported');
};
process.umask = function () {
  return 0;
};
},{}],68:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PCFShadowMap = exports.OneMinusSrcColorFactor = exports.OneMinusSrcAlphaFactor = exports.OneMinusDstColorFactor = exports.OneMinusDstAlphaFactor = exports.OneFactor = exports.ObjectSpaceNormalMap = exports.NotEqualStencilFunc = exports.NotEqualDepth = exports.NormalBlending = exports.NormalAnimationBlendMode = exports.NoToneMapping = exports.NoColorSpace = exports.NoBlending = exports.NeverStencilFunc = exports.NeverDepth = exports.NearestMipmapNearestFilter = exports.NearestMipmapLinearFilter = exports.NearestMipMapNearestFilter = exports.NearestMipMapLinearFilter = exports.NearestFilter = exports.MultiplyOperation = exports.MultiplyBlending = exports.MixOperation = exports.MirroredRepeatWrapping = exports.MinEquation = exports.MaxEquation = exports.MOUSE = exports.LuminanceFormat = exports.LuminanceAlphaFormat = exports.LoopRepeat = exports.LoopPingPong = exports.LoopOnce = exports.LinearToneMapping = exports.LinearSRGBColorSpace = exports.LinearMipmapNearestFilter = exports.LinearMipmapLinearFilter = exports.LinearMipMapNearestFilter = exports.LinearMipMapLinearFilter = exports.LinearFilter = exports.LinearEncoding = exports.LessStencilFunc = exports.LessEqualStencilFunc = exports.LessEqualDepth = exports.LessDepth = exports.KeepStencilOp = exports.InvertStencilOp = exports.InterpolateSmooth = exports.InterpolateLinear = exports.InterpolateDiscrete = exports.IntType = exports.IncrementWrapStencilOp = exports.IncrementStencilOp = exports.HalfFloatType = exports.GreaterStencilFunc = exports.GreaterEqualStencilFunc = exports.GreaterEqualDepth = exports.GreaterDepth = exports.GLSL3 = exports.GLSL1 = exports.FrontSide = exports.FloatType = exports.FlatShading = exports.EquirectangularRefractionMapping = exports.EquirectangularReflectionMapping = exports.EqualStencilFunc = exports.EqualDepth = exports.DynamicReadUsage = exports.DynamicDrawUsage = exports.DynamicCopyUsage = exports.DstColorFactor = exports.DstAlphaFactor = exports.DoubleSide = exports.DepthStencilFormat = exports.DepthFormat = exports.DecrementWrapStencilOp = exports.DecrementStencilOp = exports.CustomToneMapping = exports.CustomBlending = exports.CullFaceNone = exports.CullFaceFrontBack = exports.CullFaceFront = exports.CullFaceBack = exports.CubeUVReflectionMapping = exports.CubeRefractionMapping = exports.CubeReflectionMapping = exports.ClampToEdgeWrapping = exports.CineonToneMapping = exports.ByteType = exports.BasicShadowMap = exports.BasicDepthPacking = exports.BackSide = exports.AlwaysStencilFunc = exports.AlwaysDepth = exports.AlphaFormat = exports.AdditiveBlending = exports.AdditiveAnimationBlendMode = exports.AddOperation = exports.AddEquation = exports.ACESFilmicToneMapping = void 0;
exports.sRGBEncoding = exports._SRGBAFormat = exports.ZeroStencilOp = exports.ZeroSlopeEnding = exports.ZeroFactor = exports.ZeroCurvatureEnding = exports.WrapAroundEnding = exports.VSMShadowMap = exports.UnsignedShortType = exports.UnsignedShort5551Type = exports.UnsignedShort4444Type = exports.UnsignedIntType = exports.UnsignedInt248Type = exports.UnsignedByteType = exports.UVMapping = exports.TrianglesDrawMode = exports.TriangleStripDrawMode = exports.TriangleFanDrawMode = exports.TangentSpaceNormalMap = exports.TOUCH = exports.SubtractiveBlending = exports.SubtractEquation = exports.StreamReadUsage = exports.StreamDrawUsage = exports.StreamCopyUsage = exports.StaticReadUsage = exports.StaticDrawUsage = exports.StaticCopyUsage = exports.SrcColorFactor = exports.SrcAlphaSaturateFactor = exports.SrcAlphaFactor = exports.SmoothShading = exports.ShortType = exports.SRGBColorSpace = exports.ReverseSubtractEquation = exports.ReplaceStencilOp = exports.RepeatWrapping = exports.ReinhardToneMapping = exports.RedIntegerFormat = exports.RedFormat = exports.RGIntegerFormat = exports.RGFormat = exports.RGB_S3TC_DXT1_Format = exports.RGB_PVRTC_4BPPV1_Format = exports.RGB_PVRTC_2BPPV1_Format = exports.RGB_ETC2_Format = exports.RGB_ETC1_Format = exports.RGBFormat = exports.RGBA_S3TC_DXT5_Format = exports.RGBA_S3TC_DXT3_Format = exports.RGBA_S3TC_DXT1_Format = exports.RGBA_PVRTC_4BPPV1_Format = exports.RGBA_PVRTC_2BPPV1_Format = exports.RGBA_ETC2_EAC_Format = exports.RGBA_BPTC_Format = exports.RGBA_ASTC_8x8_Format = exports.RGBA_ASTC_8x6_Format = exports.RGBA_ASTC_8x5_Format = exports.RGBA_ASTC_6x6_Format = exports.RGBA_ASTC_6x5_Format = exports.RGBA_ASTC_5x5_Format = exports.RGBA_ASTC_5x4_Format = exports.RGBA_ASTC_4x4_Format = exports.RGBA_ASTC_12x12_Format = exports.RGBA_ASTC_12x10_Format = exports.RGBA_ASTC_10x8_Format = exports.RGBA_ASTC_10x6_Format = exports.RGBA_ASTC_10x5_Format = exports.RGBA_ASTC_10x10_Format = exports.RGBAIntegerFormat = exports.RGBAFormat = exports.RGBADepthPacking = exports.REVISION = exports.PCFSoftShadowMap = void 0;
var REVISION = '139';
exports.REVISION = REVISION;
var MOUSE = {
  LEFT: 0,
  MIDDLE: 1,
  RIGHT: 2,
  ROTATE: 0,
  DOLLY: 1,
  PAN: 2
};
exports.MOUSE = MOUSE;
var TOUCH = {
  ROTATE: 0,
  PAN: 1,
  DOLLY_PAN: 2,
  DOLLY_ROTATE: 3
};
exports.TOUCH = TOUCH;
var CullFaceNone = 0;
exports.CullFaceNone = CullFaceNone;
var CullFaceBack = 1;
exports.CullFaceBack = CullFaceBack;
var CullFaceFront = 2;
exports.CullFaceFront = CullFaceFront;
var CullFaceFrontBack = 3;
exports.CullFaceFrontBack = CullFaceFrontBack;
var BasicShadowMap = 0;
exports.BasicShadowMap = BasicShadowMap;
var PCFShadowMap = 1;
exports.PCFShadowMap = PCFShadowMap;
var PCFSoftShadowMap = 2;
exports.PCFSoftShadowMap = PCFSoftShadowMap;
var VSMShadowMap = 3;
exports.VSMShadowMap = VSMShadowMap;
var FrontSide = 0;
exports.FrontSide = FrontSide;
var BackSide = 1;
exports.BackSide = BackSide;
var DoubleSide = 2;
exports.DoubleSide = DoubleSide;
var FlatShading = 1;
exports.FlatShading = FlatShading;
var SmoothShading = 2;
exports.SmoothShading = SmoothShading;
var NoBlending = 0;
exports.NoBlending = NoBlending;
var NormalBlending = 1;
exports.NormalBlending = NormalBlending;
var AdditiveBlending = 2;
exports.AdditiveBlending = AdditiveBlending;
var SubtractiveBlending = 3;
exports.SubtractiveBlending = SubtractiveBlending;
var MultiplyBlending = 4;
exports.MultiplyBlending = MultiplyBlending;
var CustomBlending = 5;
exports.CustomBlending = CustomBlending;
var AddEquation = 100;
exports.AddEquation = AddEquation;
var SubtractEquation = 101;
exports.SubtractEquation = SubtractEquation;
var ReverseSubtractEquation = 102;
exports.ReverseSubtractEquation = ReverseSubtractEquation;
var MinEquation = 103;
exports.MinEquation = MinEquation;
var MaxEquation = 104;
exports.MaxEquation = MaxEquation;
var ZeroFactor = 200;
exports.ZeroFactor = ZeroFactor;
var OneFactor = 201;
exports.OneFactor = OneFactor;
var SrcColorFactor = 202;
exports.SrcColorFactor = SrcColorFactor;
var OneMinusSrcColorFactor = 203;
exports.OneMinusSrcColorFactor = OneMinusSrcColorFactor;
var SrcAlphaFactor = 204;
exports.SrcAlphaFactor = SrcAlphaFactor;
var OneMinusSrcAlphaFactor = 205;
exports.OneMinusSrcAlphaFactor = OneMinusSrcAlphaFactor;
var DstAlphaFactor = 206;
exports.DstAlphaFactor = DstAlphaFactor;
var OneMinusDstAlphaFactor = 207;
exports.OneMinusDstAlphaFactor = OneMinusDstAlphaFactor;
var DstColorFactor = 208;
exports.DstColorFactor = DstColorFactor;
var OneMinusDstColorFactor = 209;
exports.OneMinusDstColorFactor = OneMinusDstColorFactor;
var SrcAlphaSaturateFactor = 210;
exports.SrcAlphaSaturateFactor = SrcAlphaSaturateFactor;
var NeverDepth = 0;
exports.NeverDepth = NeverDepth;
var AlwaysDepth = 1;
exports.AlwaysDepth = AlwaysDepth;
var LessDepth = 2;
exports.LessDepth = LessDepth;
var LessEqualDepth = 3;
exports.LessEqualDepth = LessEqualDepth;
var EqualDepth = 4;
exports.EqualDepth = EqualDepth;
var GreaterEqualDepth = 5;
exports.GreaterEqualDepth = GreaterEqualDepth;
var GreaterDepth = 6;
exports.GreaterDepth = GreaterDepth;
var NotEqualDepth = 7;
exports.NotEqualDepth = NotEqualDepth;
var MultiplyOperation = 0;
exports.MultiplyOperation = MultiplyOperation;
var MixOperation = 1;
exports.MixOperation = MixOperation;
var AddOperation = 2;
exports.AddOperation = AddOperation;
var NoToneMapping = 0;
exports.NoToneMapping = NoToneMapping;
var LinearToneMapping = 1;
exports.LinearToneMapping = LinearToneMapping;
var ReinhardToneMapping = 2;
exports.ReinhardToneMapping = ReinhardToneMapping;
var CineonToneMapping = 3;
exports.CineonToneMapping = CineonToneMapping;
var ACESFilmicToneMapping = 4;
exports.ACESFilmicToneMapping = ACESFilmicToneMapping;
var CustomToneMapping = 5;
exports.CustomToneMapping = CustomToneMapping;
var UVMapping = 300;
exports.UVMapping = UVMapping;
var CubeReflectionMapping = 301;
exports.CubeReflectionMapping = CubeReflectionMapping;
var CubeRefractionMapping = 302;
exports.CubeRefractionMapping = CubeRefractionMapping;
var EquirectangularReflectionMapping = 303;
exports.EquirectangularReflectionMapping = EquirectangularReflectionMapping;
var EquirectangularRefractionMapping = 304;
exports.EquirectangularRefractionMapping = EquirectangularRefractionMapping;
var CubeUVReflectionMapping = 306;
exports.CubeUVReflectionMapping = CubeUVReflectionMapping;
var RepeatWrapping = 1000;
exports.RepeatWrapping = RepeatWrapping;
var ClampToEdgeWrapping = 1001;
exports.ClampToEdgeWrapping = ClampToEdgeWrapping;
var MirroredRepeatWrapping = 1002;
exports.MirroredRepeatWrapping = MirroredRepeatWrapping;
var NearestFilter = 1003;
exports.NearestFilter = NearestFilter;
var NearestMipmapNearestFilter = 1004;
exports.NearestMipmapNearestFilter = NearestMipmapNearestFilter;
var NearestMipMapNearestFilter = 1004;
exports.NearestMipMapNearestFilter = NearestMipMapNearestFilter;
var NearestMipmapLinearFilter = 1005;
exports.NearestMipmapLinearFilter = NearestMipmapLinearFilter;
var NearestMipMapLinearFilter = 1005;
exports.NearestMipMapLinearFilter = NearestMipMapLinearFilter;
var LinearFilter = 1006;
exports.LinearFilter = LinearFilter;
var LinearMipmapNearestFilter = 1007;
exports.LinearMipmapNearestFilter = LinearMipmapNearestFilter;
var LinearMipMapNearestFilter = 1007;
exports.LinearMipMapNearestFilter = LinearMipMapNearestFilter;
var LinearMipmapLinearFilter = 1008;
exports.LinearMipmapLinearFilter = LinearMipmapLinearFilter;
var LinearMipMapLinearFilter = 1008;
exports.LinearMipMapLinearFilter = LinearMipMapLinearFilter;
var UnsignedByteType = 1009;
exports.UnsignedByteType = UnsignedByteType;
var ByteType = 1010;
exports.ByteType = ByteType;
var ShortType = 1011;
exports.ShortType = ShortType;
var UnsignedShortType = 1012;
exports.UnsignedShortType = UnsignedShortType;
var IntType = 1013;
exports.IntType = IntType;
var UnsignedIntType = 1014;
exports.UnsignedIntType = UnsignedIntType;
var FloatType = 1015;
exports.FloatType = FloatType;
var HalfFloatType = 1016;
exports.HalfFloatType = HalfFloatType;
var UnsignedShort4444Type = 1017;
exports.UnsignedShort4444Type = UnsignedShort4444Type;
var UnsignedShort5551Type = 1018;
exports.UnsignedShort5551Type = UnsignedShort5551Type;
var UnsignedInt248Type = 1020;
exports.UnsignedInt248Type = UnsignedInt248Type;
var AlphaFormat = 1021;
exports.AlphaFormat = AlphaFormat;
var RGBFormat = 1022;
exports.RGBFormat = RGBFormat;
var RGBAFormat = 1023;
exports.RGBAFormat = RGBAFormat;
var LuminanceFormat = 1024;
exports.LuminanceFormat = LuminanceFormat;
var LuminanceAlphaFormat = 1025;
exports.LuminanceAlphaFormat = LuminanceAlphaFormat;
var DepthFormat = 1026;
exports.DepthFormat = DepthFormat;
var DepthStencilFormat = 1027;
exports.DepthStencilFormat = DepthStencilFormat;
var RedFormat = 1028;
exports.RedFormat = RedFormat;
var RedIntegerFormat = 1029;
exports.RedIntegerFormat = RedIntegerFormat;
var RGFormat = 1030;
exports.RGFormat = RGFormat;
var RGIntegerFormat = 1031;
exports.RGIntegerFormat = RGIntegerFormat;
var RGBAIntegerFormat = 1033;
exports.RGBAIntegerFormat = RGBAIntegerFormat;
var RGB_S3TC_DXT1_Format = 33776;
exports.RGB_S3TC_DXT1_Format = RGB_S3TC_DXT1_Format;
var RGBA_S3TC_DXT1_Format = 33777;
exports.RGBA_S3TC_DXT1_Format = RGBA_S3TC_DXT1_Format;
var RGBA_S3TC_DXT3_Format = 33778;
exports.RGBA_S3TC_DXT3_Format = RGBA_S3TC_DXT3_Format;
var RGBA_S3TC_DXT5_Format = 33779;
exports.RGBA_S3TC_DXT5_Format = RGBA_S3TC_DXT5_Format;
var RGB_PVRTC_4BPPV1_Format = 35840;
exports.RGB_PVRTC_4BPPV1_Format = RGB_PVRTC_4BPPV1_Format;
var RGB_PVRTC_2BPPV1_Format = 35841;
exports.RGB_PVRTC_2BPPV1_Format = RGB_PVRTC_2BPPV1_Format;
var RGBA_PVRTC_4BPPV1_Format = 35842;
exports.RGBA_PVRTC_4BPPV1_Format = RGBA_PVRTC_4BPPV1_Format;
var RGBA_PVRTC_2BPPV1_Format = 35843;
exports.RGBA_PVRTC_2BPPV1_Format = RGBA_PVRTC_2BPPV1_Format;
var RGB_ETC1_Format = 36196;
exports.RGB_ETC1_Format = RGB_ETC1_Format;
var RGB_ETC2_Format = 37492;
exports.RGB_ETC2_Format = RGB_ETC2_Format;
var RGBA_ETC2_EAC_Format = 37496;
exports.RGBA_ETC2_EAC_Format = RGBA_ETC2_EAC_Format;
var RGBA_ASTC_4x4_Format = 37808;
exports.RGBA_ASTC_4x4_Format = RGBA_ASTC_4x4_Format;
var RGBA_ASTC_5x4_Format = 37809;
exports.RGBA_ASTC_5x4_Format = RGBA_ASTC_5x4_Format;
var RGBA_ASTC_5x5_Format = 37810;
exports.RGBA_ASTC_5x5_Format = RGBA_ASTC_5x5_Format;
var RGBA_ASTC_6x5_Format = 37811;
exports.RGBA_ASTC_6x5_Format = RGBA_ASTC_6x5_Format;
var RGBA_ASTC_6x6_Format = 37812;
exports.RGBA_ASTC_6x6_Format = RGBA_ASTC_6x6_Format;
var RGBA_ASTC_8x5_Format = 37813;
exports.RGBA_ASTC_8x5_Format = RGBA_ASTC_8x5_Format;
var RGBA_ASTC_8x6_Format = 37814;
exports.RGBA_ASTC_8x6_Format = RGBA_ASTC_8x6_Format;
var RGBA_ASTC_8x8_Format = 37815;
exports.RGBA_ASTC_8x8_Format = RGBA_ASTC_8x8_Format;
var RGBA_ASTC_10x5_Format = 37816;
exports.RGBA_ASTC_10x5_Format = RGBA_ASTC_10x5_Format;
var RGBA_ASTC_10x6_Format = 37817;
exports.RGBA_ASTC_10x6_Format = RGBA_ASTC_10x6_Format;
var RGBA_ASTC_10x8_Format = 37818;
exports.RGBA_ASTC_10x8_Format = RGBA_ASTC_10x8_Format;
var RGBA_ASTC_10x10_Format = 37819;
exports.RGBA_ASTC_10x10_Format = RGBA_ASTC_10x10_Format;
var RGBA_ASTC_12x10_Format = 37820;
exports.RGBA_ASTC_12x10_Format = RGBA_ASTC_12x10_Format;
var RGBA_ASTC_12x12_Format = 37821;
exports.RGBA_ASTC_12x12_Format = RGBA_ASTC_12x12_Format;
var RGBA_BPTC_Format = 36492;
exports.RGBA_BPTC_Format = RGBA_BPTC_Format;
var LoopOnce = 2200;
exports.LoopOnce = LoopOnce;
var LoopRepeat = 2201;
exports.LoopRepeat = LoopRepeat;
var LoopPingPong = 2202;
exports.LoopPingPong = LoopPingPong;
var InterpolateDiscrete = 2300;
exports.InterpolateDiscrete = InterpolateDiscrete;
var InterpolateLinear = 2301;
exports.InterpolateLinear = InterpolateLinear;
var InterpolateSmooth = 2302;
exports.InterpolateSmooth = InterpolateSmooth;
var ZeroCurvatureEnding = 2400;
exports.ZeroCurvatureEnding = ZeroCurvatureEnding;
var ZeroSlopeEnding = 2401;
exports.ZeroSlopeEnding = ZeroSlopeEnding;
var WrapAroundEnding = 2402;
exports.WrapAroundEnding = WrapAroundEnding;
var NormalAnimationBlendMode = 2500;
exports.NormalAnimationBlendMode = NormalAnimationBlendMode;
var AdditiveAnimationBlendMode = 2501;
exports.AdditiveAnimationBlendMode = AdditiveAnimationBlendMode;
var TrianglesDrawMode = 0;
exports.TrianglesDrawMode = TrianglesDrawMode;
var TriangleStripDrawMode = 1;
exports.TriangleStripDrawMode = TriangleStripDrawMode;
var TriangleFanDrawMode = 2;
exports.TriangleFanDrawMode = TriangleFanDrawMode;
var LinearEncoding = 3000;
exports.LinearEncoding = LinearEncoding;
var sRGBEncoding = 3001;
exports.sRGBEncoding = sRGBEncoding;
var BasicDepthPacking = 3200;
exports.BasicDepthPacking = BasicDepthPacking;
var RGBADepthPacking = 3201;
exports.RGBADepthPacking = RGBADepthPacking;
var TangentSpaceNormalMap = 0;
exports.TangentSpaceNormalMap = TangentSpaceNormalMap;
var ObjectSpaceNormalMap = 1;

// Color space string identifiers, matching CSS Color Module Level 4 and WebGPU names where available.
exports.ObjectSpaceNormalMap = ObjectSpaceNormalMap;
var NoColorSpace = '';
exports.NoColorSpace = NoColorSpace;
var SRGBColorSpace = 'srgb';
exports.SRGBColorSpace = SRGBColorSpace;
var LinearSRGBColorSpace = 'srgb-linear';
exports.LinearSRGBColorSpace = LinearSRGBColorSpace;
var ZeroStencilOp = 0;
exports.ZeroStencilOp = ZeroStencilOp;
var KeepStencilOp = 7680;
exports.KeepStencilOp = KeepStencilOp;
var ReplaceStencilOp = 7681;
exports.ReplaceStencilOp = ReplaceStencilOp;
var IncrementStencilOp = 7682;
exports.IncrementStencilOp = IncrementStencilOp;
var DecrementStencilOp = 7683;
exports.DecrementStencilOp = DecrementStencilOp;
var IncrementWrapStencilOp = 34055;
exports.IncrementWrapStencilOp = IncrementWrapStencilOp;
var DecrementWrapStencilOp = 34056;
exports.DecrementWrapStencilOp = DecrementWrapStencilOp;
var InvertStencilOp = 5386;
exports.InvertStencilOp = InvertStencilOp;
var NeverStencilFunc = 512;
exports.NeverStencilFunc = NeverStencilFunc;
var LessStencilFunc = 513;
exports.LessStencilFunc = LessStencilFunc;
var EqualStencilFunc = 514;
exports.EqualStencilFunc = EqualStencilFunc;
var LessEqualStencilFunc = 515;
exports.LessEqualStencilFunc = LessEqualStencilFunc;
var GreaterStencilFunc = 516;
exports.GreaterStencilFunc = GreaterStencilFunc;
var NotEqualStencilFunc = 517;
exports.NotEqualStencilFunc = NotEqualStencilFunc;
var GreaterEqualStencilFunc = 518;
exports.GreaterEqualStencilFunc = GreaterEqualStencilFunc;
var AlwaysStencilFunc = 519;
exports.AlwaysStencilFunc = AlwaysStencilFunc;
var StaticDrawUsage = 35044;
exports.StaticDrawUsage = StaticDrawUsage;
var DynamicDrawUsage = 35048;
exports.DynamicDrawUsage = DynamicDrawUsage;
var StreamDrawUsage = 35040;
exports.StreamDrawUsage = StreamDrawUsage;
var StaticReadUsage = 35045;
exports.StaticReadUsage = StaticReadUsage;
var DynamicReadUsage = 35049;
exports.DynamicReadUsage = DynamicReadUsage;
var StreamReadUsage = 35041;
exports.StreamReadUsage = StreamReadUsage;
var StaticCopyUsage = 35046;
exports.StaticCopyUsage = StaticCopyUsage;
var DynamicCopyUsage = 35050;
exports.DynamicCopyUsage = DynamicCopyUsage;
var StreamCopyUsage = 35042;
exports.StreamCopyUsage = StreamCopyUsage;
var GLSL1 = '100';
exports.GLSL1 = GLSL1;
var GLSL3 = '300 es';
exports.GLSL3 = GLSL3;
var _SRGBAFormat = 1035; // fallback for WebGL 1
exports._SRGBAFormat = _SRGBAFormat;
},{}],69:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Uint8ClampedBufferAttribute = exports.Uint8BufferAttribute = exports.Uint32BufferAttribute = exports.Uint16BufferAttribute = exports.Int8BufferAttribute = exports.Int32BufferAttribute = exports.Int16BufferAttribute = exports.Float64BufferAttribute = exports.Float32BufferAttribute = exports.Float16BufferAttribute = exports.BufferAttribute = void 0;
var _Vector = require("../math/Vector4.js");
var _Vector2 = require("../math/Vector3.js");
var _Vector3 = require("../math/Vector2.js");
var _Color = require("../math/Color.js");
var _constants = require("../constants.js");
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var _vector = /*@__PURE__*/new _Vector2.Vector3();
var _vector2 = /*@__PURE__*/new _Vector3.Vector2();
var BufferAttribute = /*#__PURE__*/function () {
  function BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, BufferAttribute);
    if (Array.isArray(array)) {
      throw new TypeError('THREE.BufferAttribute: array should be a Typed Array.');
    }
    this.name = '';
    this.array = array;
    this.itemSize = itemSize;
    this.count = array !== undefined ? array.length / itemSize : 0;
    this.normalized = normalized === true;
    this.usage = _constants.StaticDrawUsage;
    this.updateRange = {
      offset: 0,
      count: -1
    };
    this.version = 0;
  }
  _createClass(BufferAttribute, [{
    key: "onUploadCallback",
    value: function onUploadCallback() {}
  }, {
    key: "needsUpdate",
    set: function set(value) {
      if (value === true) this.version++;
    }
  }, {
    key: "setUsage",
    value: function setUsage(value) {
      this.usage = value;
      return this;
    }
  }, {
    key: "copy",
    value: function copy(source) {
      this.name = source.name;
      this.array = new source.array.constructor(source.array);
      this.itemSize = source.itemSize;
      this.count = source.count;
      this.normalized = source.normalized;
      this.usage = source.usage;
      return this;
    }
  }, {
    key: "copyAt",
    value: function copyAt(index1, attribute, index2) {
      index1 *= this.itemSize;
      index2 *= attribute.itemSize;
      for (var i = 0, l = this.itemSize; i < l; i++) {
        this.array[index1 + i] = attribute.array[index2 + i];
      }
      return this;
    }
  }, {
    key: "copyArray",
    value: function copyArray(array) {
      this.array.set(array);
      return this;
    }
  }, {
    key: "copyColorsArray",
    value: function copyColorsArray(colors) {
      var array = this.array;
      var offset = 0;
      for (var i = 0, l = colors.length; i < l; i++) {
        var color = colors[i];
        if (color === undefined) {
          console.warn('THREE.BufferAttribute.copyColorsArray(): color is undefined', i);
          color = new _Color.Color();
        }
        array[offset++] = color.r;
        array[offset++] = color.g;
        array[offset++] = color.b;
      }
      return this;
    }
  }, {
    key: "copyVector2sArray",
    value: function copyVector2sArray(vectors) {
      var array = this.array;
      var offset = 0;
      for (var i = 0, l = vectors.length; i < l; i++) {
        var vector = vectors[i];
        if (vector === undefined) {
          console.warn('THREE.BufferAttribute.copyVector2sArray(): vector is undefined', i);
          vector = new _Vector3.Vector2();
        }
        array[offset++] = vector.x;
        array[offset++] = vector.y;
      }
      return this;
    }
  }, {
    key: "copyVector3sArray",
    value: function copyVector3sArray(vectors) {
      var array = this.array;
      var offset = 0;
      for (var i = 0, l = vectors.length; i < l; i++) {
        var vector = vectors[i];
        if (vector === undefined) {
          console.warn('THREE.BufferAttribute.copyVector3sArray(): vector is undefined', i);
          vector = new _Vector2.Vector3();
        }
        array[offset++] = vector.x;
        array[offset++] = vector.y;
        array[offset++] = vector.z;
      }
      return this;
    }
  }, {
    key: "copyVector4sArray",
    value: function copyVector4sArray(vectors) {
      var array = this.array;
      var offset = 0;
      for (var i = 0, l = vectors.length; i < l; i++) {
        var vector = vectors[i];
        if (vector === undefined) {
          console.warn('THREE.BufferAttribute.copyVector4sArray(): vector is undefined', i);
          vector = new _Vector.Vector4();
        }
        array[offset++] = vector.x;
        array[offset++] = vector.y;
        array[offset++] = vector.z;
        array[offset++] = vector.w;
      }
      return this;
    }
  }, {
    key: "applyMatrix3",
    value: function applyMatrix3(m) {
      if (this.itemSize === 2) {
        for (var i = 0, l = this.count; i < l; i++) {
          _vector2.fromBufferAttribute(this, i);
          _vector2.applyMatrix3(m);
          this.setXY(i, _vector2.x, _vector2.y);
        }
      } else if (this.itemSize === 3) {
        for (var _i = 0, _l = this.count; _i < _l; _i++) {
          _vector.fromBufferAttribute(this, _i);
          _vector.applyMatrix3(m);
          this.setXYZ(_i, _vector.x, _vector.y, _vector.z);
        }
      }
      return this;
    }
  }, {
    key: "applyMatrix4",
    value: function applyMatrix4(m) {
      for (var i = 0, l = this.count; i < l; i++) {
        _vector.fromBufferAttribute(this, i);
        _vector.applyMatrix4(m);
        this.setXYZ(i, _vector.x, _vector.y, _vector.z);
      }
      return this;
    }
  }, {
    key: "applyNormalMatrix",
    value: function applyNormalMatrix(m) {
      for (var i = 0, l = this.count; i < l; i++) {
        _vector.fromBufferAttribute(this, i);
        _vector.applyNormalMatrix(m);
        this.setXYZ(i, _vector.x, _vector.y, _vector.z);
      }
      return this;
    }
  }, {
    key: "transformDirection",
    value: function transformDirection(m) {
      for (var i = 0, l = this.count; i < l; i++) {
        _vector.fromBufferAttribute(this, i);
        _vector.transformDirection(m);
        this.setXYZ(i, _vector.x, _vector.y, _vector.z);
      }
      return this;
    }
  }, {
    key: "set",
    value: function set(value) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this.array.set(value, offset);
      return this;
    }
  }, {
    key: "getX",
    value: function getX(index) {
      return this.array[index * this.itemSize];
    }
  }, {
    key: "setX",
    value: function setX(index, x) {
      this.array[index * this.itemSize] = x;
      return this;
    }
  }, {
    key: "getY",
    value: function getY(index) {
      return this.array[index * this.itemSize + 1];
    }
  }, {
    key: "setY",
    value: function setY(index, y) {
      this.array[index * this.itemSize + 1] = y;
      return this;
    }
  }, {
    key: "getZ",
    value: function getZ(index) {
      return this.array[index * this.itemSize + 2];
    }
  }, {
    key: "setZ",
    value: function setZ(index, z) {
      this.array[index * this.itemSize + 2] = z;
      return this;
    }
  }, {
    key: "getW",
    value: function getW(index) {
      return this.array[index * this.itemSize + 3];
    }
  }, {
    key: "setW",
    value: function setW(index, w) {
      this.array[index * this.itemSize + 3] = w;
      return this;
    }
  }, {
    key: "setXY",
    value: function setXY(index, x, y) {
      index *= this.itemSize;
      this.array[index + 0] = x;
      this.array[index + 1] = y;
      return this;
    }
  }, {
    key: "setXYZ",
    value: function setXYZ(index, x, y, z) {
      index *= this.itemSize;
      this.array[index + 0] = x;
      this.array[index + 1] = y;
      this.array[index + 2] = z;
      return this;
    }
  }, {
    key: "setXYZW",
    value: function setXYZW(index, x, y, z, w) {
      index *= this.itemSize;
      this.array[index + 0] = x;
      this.array[index + 1] = y;
      this.array[index + 2] = z;
      this.array[index + 3] = w;
      return this;
    }
  }, {
    key: "onUpload",
    value: function onUpload(callback) {
      this.onUploadCallback = callback;
      return this;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor(this.array, this.itemSize).copy(this);
    }
  }, {
    key: "toJSON",
    value: function toJSON() {
      var data = {
        itemSize: this.itemSize,
        type: this.array.constructor.name,
        array: Array.prototype.slice.call(this.array),
        normalized: this.normalized
      };
      if (this.name !== '') data.name = this.name;
      if (this.usage !== _constants.StaticDrawUsage) data.usage = this.usage;
      if (this.updateRange.offset !== 0 || this.updateRange.count !== -1) data.updateRange = this.updateRange;
      return data;
    }
  }]);
  return BufferAttribute;
}();
exports.BufferAttribute = BufferAttribute;
BufferAttribute.prototype.isBufferAttribute = true;

//
var Int8BufferAttribute = /*#__PURE__*/function (_BufferAttribute) {
  _inherits(Int8BufferAttribute, _BufferAttribute);
  var _super = _createSuper(Int8BufferAttribute);
  function Int8BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Int8BufferAttribute);
    return _super.call(this, new Int8Array(array), itemSize, normalized);
  }
  return _createClass(Int8BufferAttribute);
}(BufferAttribute);
exports.Int8BufferAttribute = Int8BufferAttribute;
var Uint8BufferAttribute = /*#__PURE__*/function (_BufferAttribute2) {
  _inherits(Uint8BufferAttribute, _BufferAttribute2);
  var _super2 = _createSuper(Uint8BufferAttribute);
  function Uint8BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Uint8BufferAttribute);
    return _super2.call(this, new Uint8Array(array), itemSize, normalized);
  }
  return _createClass(Uint8BufferAttribute);
}(BufferAttribute);
exports.Uint8BufferAttribute = Uint8BufferAttribute;
var Uint8ClampedBufferAttribute = /*#__PURE__*/function (_BufferAttribute3) {
  _inherits(Uint8ClampedBufferAttribute, _BufferAttribute3);
  var _super3 = _createSuper(Uint8ClampedBufferAttribute);
  function Uint8ClampedBufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Uint8ClampedBufferAttribute);
    return _super3.call(this, new Uint8ClampedArray(array), itemSize, normalized);
  }
  return _createClass(Uint8ClampedBufferAttribute);
}(BufferAttribute);
exports.Uint8ClampedBufferAttribute = Uint8ClampedBufferAttribute;
var Int16BufferAttribute = /*#__PURE__*/function (_BufferAttribute4) {
  _inherits(Int16BufferAttribute, _BufferAttribute4);
  var _super4 = _createSuper(Int16BufferAttribute);
  function Int16BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Int16BufferAttribute);
    return _super4.call(this, new Int16Array(array), itemSize, normalized);
  }
  return _createClass(Int16BufferAttribute);
}(BufferAttribute);
exports.Int16BufferAttribute = Int16BufferAttribute;
var Uint16BufferAttribute = /*#__PURE__*/function (_BufferAttribute5) {
  _inherits(Uint16BufferAttribute, _BufferAttribute5);
  var _super5 = _createSuper(Uint16BufferAttribute);
  function Uint16BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Uint16BufferAttribute);
    return _super5.call(this, new Uint16Array(array), itemSize, normalized);
  }
  return _createClass(Uint16BufferAttribute);
}(BufferAttribute);
exports.Uint16BufferAttribute = Uint16BufferAttribute;
var Int32BufferAttribute = /*#__PURE__*/function (_BufferAttribute6) {
  _inherits(Int32BufferAttribute, _BufferAttribute6);
  var _super6 = _createSuper(Int32BufferAttribute);
  function Int32BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Int32BufferAttribute);
    return _super6.call(this, new Int32Array(array), itemSize, normalized);
  }
  return _createClass(Int32BufferAttribute);
}(BufferAttribute);
exports.Int32BufferAttribute = Int32BufferAttribute;
var Uint32BufferAttribute = /*#__PURE__*/function (_BufferAttribute7) {
  _inherits(Uint32BufferAttribute, _BufferAttribute7);
  var _super7 = _createSuper(Uint32BufferAttribute);
  function Uint32BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Uint32BufferAttribute);
    return _super7.call(this, new Uint32Array(array), itemSize, normalized);
  }
  return _createClass(Uint32BufferAttribute);
}(BufferAttribute);
exports.Uint32BufferAttribute = Uint32BufferAttribute;
var Float16BufferAttribute = /*#__PURE__*/function (_BufferAttribute8) {
  _inherits(Float16BufferAttribute, _BufferAttribute8);
  var _super8 = _createSuper(Float16BufferAttribute);
  function Float16BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Float16BufferAttribute);
    return _super8.call(this, new Uint16Array(array), itemSize, normalized);
  }
  return _createClass(Float16BufferAttribute);
}(BufferAttribute);
exports.Float16BufferAttribute = Float16BufferAttribute;
Float16BufferAttribute.prototype.isFloat16BufferAttribute = true;
var Float32BufferAttribute = /*#__PURE__*/function (_BufferAttribute9) {
  _inherits(Float32BufferAttribute, _BufferAttribute9);
  var _super9 = _createSuper(Float32BufferAttribute);
  function Float32BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Float32BufferAttribute);
    return _super9.call(this, new Float32Array(array), itemSize, normalized);
  }
  return _createClass(Float32BufferAttribute);
}(BufferAttribute);
exports.Float32BufferAttribute = Float32BufferAttribute;
var Float64BufferAttribute = /*#__PURE__*/function (_BufferAttribute10) {
  _inherits(Float64BufferAttribute, _BufferAttribute10);
  var _super10 = _createSuper(Float64BufferAttribute);
  function Float64BufferAttribute(array, itemSize, normalized) {
    _classCallCheck(this, Float64BufferAttribute);
    return _super10.call(this, new Float64Array(array), itemSize, normalized);
  }
  return _createClass(Float64BufferAttribute);
}(BufferAttribute); //
exports.Float64BufferAttribute = Float64BufferAttribute;
},{"../constants.js":68,"../math/Color.js":81,"../math/Vector2.js":89,"../math/Vector3.js":90,"../math/Vector4.js":91}],70:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.BufferGeometry = void 0;
var _Vector = require("../math/Vector3.js");
var _Vector2 = require("../math/Vector2.js");
var _Box = require("../math/Box3.js");
var _EventDispatcher2 = require("./EventDispatcher.js");
var _BufferAttribute = require("./BufferAttribute.js");
var _Sphere = require("../math/Sphere.js");
var _Object3D = require("./Object3D.js");
var _Matrix = require("../math/Matrix4.js");
var _Matrix2 = require("../math/Matrix3.js");
var MathUtils = _interopRequireWildcard(require("../math/MathUtils.js"));
var _utils = require("../utils.js");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var _id = 0;
var _m1 = /*@__PURE__*/new _Matrix.Matrix4();
var _obj = /*@__PURE__*/new _Object3D.Object3D();
var _offset = /*@__PURE__*/new _Vector.Vector3();
var _box = /*@__PURE__*/new _Box.Box3();
var _boxMorphTargets = /*@__PURE__*/new _Box.Box3();
var _vector = /*@__PURE__*/new _Vector.Vector3();
var BufferGeometry = /*#__PURE__*/function (_EventDispatcher) {
  _inherits(BufferGeometry, _EventDispatcher);
  var _super = _createSuper(BufferGeometry);
  function BufferGeometry() {
    var _this;
    _classCallCheck(this, BufferGeometry);
    _this = _super.call(this);
    Object.defineProperty(_assertThisInitialized(_this), 'id', {
      value: _id++
    });
    _this.uuid = MathUtils.generateUUID();
    _this.name = '';
    _this.type = 'BufferGeometry';
    _this.index = null;
    _this.attributes = {};
    _this.morphAttributes = {};
    _this.morphTargetsRelative = false;
    _this.groups = [];
    _this.boundingBox = null;
    _this.boundingSphere = null;
    _this.drawRange = {
      start: 0,
      count: Infinity
    };
    _this.userData = {};
    return _this;
  }
  _createClass(BufferGeometry, [{
    key: "getIndex",
    value: function getIndex() {
      return this.index;
    }
  }, {
    key: "setIndex",
    value: function setIndex(index) {
      if (Array.isArray(index)) {
        this.index = new ((0, _utils.arrayNeedsUint32)(index) ? _BufferAttribute.Uint32BufferAttribute : _BufferAttribute.Uint16BufferAttribute)(index, 1);
      } else {
        this.index = index;
      }
      return this;
    }
  }, {
    key: "getAttribute",
    value: function getAttribute(name) {
      return this.attributes[name];
    }
  }, {
    key: "setAttribute",
    value: function setAttribute(name, attribute) {
      this.attributes[name] = attribute;
      return this;
    }
  }, {
    key: "deleteAttribute",
    value: function deleteAttribute(name) {
      delete this.attributes[name];
      return this;
    }
  }, {
    key: "hasAttribute",
    value: function hasAttribute(name) {
      return this.attributes[name] !== undefined;
    }
  }, {
    key: "addGroup",
    value: function addGroup(start, count) {
      var materialIndex = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
      this.groups.push({
        start: start,
        count: count,
        materialIndex: materialIndex
      });
    }
  }, {
    key: "clearGroups",
    value: function clearGroups() {
      this.groups = [];
    }
  }, {
    key: "setDrawRange",
    value: function setDrawRange(start, count) {
      this.drawRange.start = start;
      this.drawRange.count = count;
    }
  }, {
    key: "applyMatrix4",
    value: function applyMatrix4(matrix) {
      var position = this.attributes.position;
      if (position !== undefined) {
        position.applyMatrix4(matrix);
        position.needsUpdate = true;
      }
      var normal = this.attributes.normal;
      if (normal !== undefined) {
        var normalMatrix = new _Matrix2.Matrix3().getNormalMatrix(matrix);
        normal.applyNormalMatrix(normalMatrix);
        normal.needsUpdate = true;
      }
      var tangent = this.attributes.tangent;
      if (tangent !== undefined) {
        tangent.transformDirection(matrix);
        tangent.needsUpdate = true;
      }
      if (this.boundingBox !== null) {
        this.computeBoundingBox();
      }
      if (this.boundingSphere !== null) {
        this.computeBoundingSphere();
      }
      return this;
    }
  }, {
    key: "applyQuaternion",
    value: function applyQuaternion(q) {
      _m1.makeRotationFromQuaternion(q);
      this.applyMatrix4(_m1);
      return this;
    }
  }, {
    key: "rotateX",
    value: function rotateX(angle) {
      // rotate geometry around world x-axis

      _m1.makeRotationX(angle);
      this.applyMatrix4(_m1);
      return this;
    }
  }, {
    key: "rotateY",
    value: function rotateY(angle) {
      // rotate geometry around world y-axis

      _m1.makeRotationY(angle);
      this.applyMatrix4(_m1);
      return this;
    }
  }, {
    key: "rotateZ",
    value: function rotateZ(angle) {
      // rotate geometry around world z-axis

      _m1.makeRotationZ(angle);
      this.applyMatrix4(_m1);
      return this;
    }
  }, {
    key: "translate",
    value: function translate(x, y, z) {
      // translate geometry

      _m1.makeTranslation(x, y, z);
      this.applyMatrix4(_m1);
      return this;
    }
  }, {
    key: "scale",
    value: function scale(x, y, z) {
      // scale geometry

      _m1.makeScale(x, y, z);
      this.applyMatrix4(_m1);
      return this;
    }
  }, {
    key: "lookAt",
    value: function lookAt(vector) {
      _obj.lookAt(vector);
      _obj.updateMatrix();
      this.applyMatrix4(_obj.matrix);
      return this;
    }
  }, {
    key: "center",
    value: function center() {
      this.computeBoundingBox();
      this.boundingBox.getCenter(_offset).negate();
      this.translate(_offset.x, _offset.y, _offset.z);
      return this;
    }
  }, {
    key: "setFromPoints",
    value: function setFromPoints(points) {
      var position = [];
      for (var i = 0, l = points.length; i < l; i++) {
        var point = points[i];
        position.push(point.x, point.y, point.z || 0);
      }
      this.setAttribute('position', new _BufferAttribute.Float32BufferAttribute(position, 3));
      return this;
    }
  }, {
    key: "computeBoundingBox",
    value: function computeBoundingBox() {
      if (this.boundingBox === null) {
        this.boundingBox = new _Box.Box3();
      }
      var position = this.attributes.position;
      var morphAttributesPosition = this.morphAttributes.position;
      if (position && position.isGLBufferAttribute) {
        console.error('THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box. Alternatively set "mesh.frustumCulled" to "false".', this);
        this.boundingBox.set(new _Vector.Vector3(-Infinity, -Infinity, -Infinity), new _Vector.Vector3(+Infinity, +Infinity, +Infinity));
        return;
      }
      if (position !== undefined) {
        this.boundingBox.setFromBufferAttribute(position);

        // process morph attributes if present

        if (morphAttributesPosition) {
          for (var i = 0, il = morphAttributesPosition.length; i < il; i++) {
            var morphAttribute = morphAttributesPosition[i];
            _box.setFromBufferAttribute(morphAttribute);
            if (this.morphTargetsRelative) {
              _vector.addVectors(this.boundingBox.min, _box.min);
              this.boundingBox.expandByPoint(_vector);
              _vector.addVectors(this.boundingBox.max, _box.max);
              this.boundingBox.expandByPoint(_vector);
            } else {
              this.boundingBox.expandByPoint(_box.min);
              this.boundingBox.expandByPoint(_box.max);
            }
          }
        }
      } else {
        this.boundingBox.makeEmpty();
      }
      if (isNaN(this.boundingBox.min.x) || isNaN(this.boundingBox.min.y) || isNaN(this.boundingBox.min.z)) {
        console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.', this);
      }
    }
  }, {
    key: "computeBoundingSphere",
    value: function computeBoundingSphere() {
      if (this.boundingSphere === null) {
        this.boundingSphere = new _Sphere.Sphere();
      }
      var position = this.attributes.position;
      var morphAttributesPosition = this.morphAttributes.position;
      if (position && position.isGLBufferAttribute) {
        console.error('THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere. Alternatively set "mesh.frustumCulled" to "false".', this);
        this.boundingSphere.set(new _Vector.Vector3(), Infinity);
        return;
      }
      if (position) {
        // first, find the center of the bounding sphere

        var center = this.boundingSphere.center;
        _box.setFromBufferAttribute(position);

        // process morph attributes if present

        if (morphAttributesPosition) {
          for (var i = 0, il = morphAttributesPosition.length; i < il; i++) {
            var morphAttribute = morphAttributesPosition[i];
            _boxMorphTargets.setFromBufferAttribute(morphAttribute);
            if (this.morphTargetsRelative) {
              _vector.addVectors(_box.min, _boxMorphTargets.min);
              _box.expandByPoint(_vector);
              _vector.addVectors(_box.max, _boxMorphTargets.max);
              _box.expandByPoint(_vector);
            } else {
              _box.expandByPoint(_boxMorphTargets.min);
              _box.expandByPoint(_boxMorphTargets.max);
            }
          }
        }
        _box.getCenter(center);

        // second, try to find a boundingSphere with a radius smaller than the
        // boundingSphere of the boundingBox: sqrt(3) smaller in the best case

        var maxRadiusSq = 0;
        for (var _i = 0, _il = position.count; _i < _il; _i++) {
          _vector.fromBufferAttribute(position, _i);
          maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_vector));
        }

        // process morph attributes if present

        if (morphAttributesPosition) {
          for (var _i2 = 0, _il2 = morphAttributesPosition.length; _i2 < _il2; _i2++) {
            var _morphAttribute = morphAttributesPosition[_i2];
            var morphTargetsRelative = this.morphTargetsRelative;
            for (var j = 0, jl = _morphAttribute.count; j < jl; j++) {
              _vector.fromBufferAttribute(_morphAttribute, j);
              if (morphTargetsRelative) {
                _offset.fromBufferAttribute(position, j);
                _vector.add(_offset);
              }
              maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(_vector));
            }
          }
        }
        this.boundingSphere.radius = Math.sqrt(maxRadiusSq);
        if (isNaN(this.boundingSphere.radius)) {
          console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.', this);
        }
      }
    }
  }, {
    key: "computeTangents",
    value: function computeTangents() {
      var index = this.index;
      var attributes = this.attributes;

      // based on http://www.terathon.com/code/tangent.html
      // (per vertex tangents)

      if (index === null || attributes.position === undefined || attributes.normal === undefined || attributes.uv === undefined) {
        console.error('THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)');
        return;
      }
      var indices = index.array;
      var positions = attributes.position.array;
      var normals = attributes.normal.array;
      var uvs = attributes.uv.array;
      var nVertices = positions.length / 3;
      if (this.hasAttribute('tangent') === false) {
        this.setAttribute('tangent', new _BufferAttribute.BufferAttribute(new Float32Array(4 * nVertices), 4));
      }
      var tangents = this.getAttribute('tangent').array;
      var tan1 = [],
        tan2 = [];
      for (var i = 0; i < nVertices; i++) {
        tan1[i] = new _Vector.Vector3();
        tan2[i] = new _Vector.Vector3();
      }
      var vA = new _Vector.Vector3(),
        vB = new _Vector.Vector3(),
        vC = new _Vector.Vector3(),
        uvA = new _Vector2.Vector2(),
        uvB = new _Vector2.Vector2(),
        uvC = new _Vector2.Vector2(),
        sdir = new _Vector.Vector3(),
        tdir = new _Vector.Vector3();
      function handleTriangle(a, b, c) {
        vA.fromArray(positions, a * 3);
        vB.fromArray(positions, b * 3);
        vC.fromArray(positions, c * 3);
        uvA.fromArray(uvs, a * 2);
        uvB.fromArray(uvs, b * 2);
        uvC.fromArray(uvs, c * 2);
        vB.sub(vA);
        vC.sub(vA);
        uvB.sub(uvA);
        uvC.sub(uvA);
        var r = 1.0 / (uvB.x * uvC.y - uvC.x * uvB.y);

        // silently ignore degenerate uv triangles having coincident or colinear vertices

        if (!isFinite(r)) return;
        sdir.copy(vB).multiplyScalar(uvC.y).addScaledVector(vC, -uvB.y).multiplyScalar(r);
        tdir.copy(vC).multiplyScalar(uvB.x).addScaledVector(vB, -uvC.x).multiplyScalar(r);
        tan1[a].add(sdir);
        tan1[b].add(sdir);
        tan1[c].add(sdir);
        tan2[a].add(tdir);
        tan2[b].add(tdir);
        tan2[c].add(tdir);
      }
      var groups = this.groups;
      if (groups.length === 0) {
        groups = [{
          start: 0,
          count: indices.length
        }];
      }
      for (var _i3 = 0, il = groups.length; _i3 < il; ++_i3) {
        var group = groups[_i3];
        var start = group.start;
        var count = group.count;
        for (var j = start, jl = start + count; j < jl; j += 3) {
          handleTriangle(indices[j + 0], indices[j + 1], indices[j + 2]);
        }
      }
      var tmp = new _Vector.Vector3(),
        tmp2 = new _Vector.Vector3();
      var n = new _Vector.Vector3(),
        n2 = new _Vector.Vector3();
      function handleVertex(v) {
        n.fromArray(normals, v * 3);
        n2.copy(n);
        var t = tan1[v];

        // Gram-Schmidt orthogonalize

        tmp.copy(t);
        tmp.sub(n.multiplyScalar(n.dot(t))).normalize();

        // Calculate handedness

        tmp2.crossVectors(n2, t);
        var test = tmp2.dot(tan2[v]);
        var w = test < 0.0 ? -1.0 : 1.0;
        tangents[v * 4] = tmp.x;
        tangents[v * 4 + 1] = tmp.y;
        tangents[v * 4 + 2] = tmp.z;
        tangents[v * 4 + 3] = w;
      }
      for (var _i4 = 0, _il3 = groups.length; _i4 < _il3; ++_i4) {
        var _group = groups[_i4];
        var _start = _group.start;
        var _count = _group.count;
        for (var _j = _start, _jl = _start + _count; _j < _jl; _j += 3) {
          handleVertex(indices[_j + 0]);
          handleVertex(indices[_j + 1]);
          handleVertex(indices[_j + 2]);
        }
      }
    }
  }, {
    key: "computeVertexNormals",
    value: function computeVertexNormals() {
      var index = this.index;
      var positionAttribute = this.getAttribute('position');
      if (positionAttribute !== undefined) {
        var normalAttribute = this.getAttribute('normal');
        if (normalAttribute === undefined) {
          normalAttribute = new _BufferAttribute.BufferAttribute(new Float32Array(positionAttribute.count * 3), 3);
          this.setAttribute('normal', normalAttribute);
        } else {
          // reset existing normals to zero

          for (var i = 0, il = normalAttribute.count; i < il; i++) {
            normalAttribute.setXYZ(i, 0, 0, 0);
          }
        }
        var pA = new _Vector.Vector3(),
          pB = new _Vector.Vector3(),
          pC = new _Vector.Vector3();
        var nA = new _Vector.Vector3(),
          nB = new _Vector.Vector3(),
          nC = new _Vector.Vector3();
        var cb = new _Vector.Vector3(),
          ab = new _Vector.Vector3();

        // indexed elements

        if (index) {
          for (var _i5 = 0, _il4 = index.count; _i5 < _il4; _i5 += 3) {
            var vA = index.getX(_i5 + 0);
            var vB = index.getX(_i5 + 1);
            var vC = index.getX(_i5 + 2);
            pA.fromBufferAttribute(positionAttribute, vA);
            pB.fromBufferAttribute(positionAttribute, vB);
            pC.fromBufferAttribute(positionAttribute, vC);
            cb.subVectors(pC, pB);
            ab.subVectors(pA, pB);
            cb.cross(ab);
            nA.fromBufferAttribute(normalAttribute, vA);
            nB.fromBufferAttribute(normalAttribute, vB);
            nC.fromBufferAttribute(normalAttribute, vC);
            nA.add(cb);
            nB.add(cb);
            nC.add(cb);
            normalAttribute.setXYZ(vA, nA.x, nA.y, nA.z);
            normalAttribute.setXYZ(vB, nB.x, nB.y, nB.z);
            normalAttribute.setXYZ(vC, nC.x, nC.y, nC.z);
          }
        } else {
          // non-indexed elements (unconnected triangle soup)

          for (var _i6 = 0, _il5 = positionAttribute.count; _i6 < _il5; _i6 += 3) {
            pA.fromBufferAttribute(positionAttribute, _i6 + 0);
            pB.fromBufferAttribute(positionAttribute, _i6 + 1);
            pC.fromBufferAttribute(positionAttribute, _i6 + 2);
            cb.subVectors(pC, pB);
            ab.subVectors(pA, pB);
            cb.cross(ab);
            normalAttribute.setXYZ(_i6 + 0, cb.x, cb.y, cb.z);
            normalAttribute.setXYZ(_i6 + 1, cb.x, cb.y, cb.z);
            normalAttribute.setXYZ(_i6 + 2, cb.x, cb.y, cb.z);
          }
        }
        this.normalizeNormals();
        normalAttribute.needsUpdate = true;
      }
    }
  }, {
    key: "merge",
    value: function merge(geometry, offset) {
      if (!(geometry && geometry.isBufferGeometry)) {
        console.error('THREE.BufferGeometry.merge(): geometry not an instance of THREE.BufferGeometry.', geometry);
        return;
      }
      if (offset === undefined) {
        offset = 0;
        console.warn('THREE.BufferGeometry.merge(): Overwriting original geometry, starting at offset=0. ' + 'Use BufferGeometryUtils.mergeBufferGeometries() for lossless merge.');
      }
      var attributes = this.attributes;
      for (var key in attributes) {
        if (geometry.attributes[key] === undefined) continue;
        var attribute1 = attributes[key];
        var attributeArray1 = attribute1.array;
        var attribute2 = geometry.attributes[key];
        var attributeArray2 = attribute2.array;
        var attributeOffset = attribute2.itemSize * offset;
        var length = Math.min(attributeArray2.length, attributeArray1.length - attributeOffset);
        for (var i = 0, j = attributeOffset; i < length; i++, j++) {
          attributeArray1[j] = attributeArray2[i];
        }
      }
      return this;
    }
  }, {
    key: "normalizeNormals",
    value: function normalizeNormals() {
      var normals = this.attributes.normal;
      for (var i = 0, il = normals.count; i < il; i++) {
        _vector.fromBufferAttribute(normals, i);
        _vector.normalize();
        normals.setXYZ(i, _vector.x, _vector.y, _vector.z);
      }
    }
  }, {
    key: "toNonIndexed",
    value: function toNonIndexed() {
      function convertBufferAttribute(attribute, indices) {
        var array = attribute.array;
        var itemSize = attribute.itemSize;
        var normalized = attribute.normalized;
        var array2 = new array.constructor(indices.length * itemSize);
        var index = 0,
          index2 = 0;
        for (var i = 0, l = indices.length; i < l; i++) {
          if (attribute.isInterleavedBufferAttribute) {
            index = indices[i] * attribute.data.stride + attribute.offset;
          } else {
            index = indices[i] * itemSize;
          }
          for (var j = 0; j < itemSize; j++) {
            array2[index2++] = array[index++];
          }
        }
        return new _BufferAttribute.BufferAttribute(array2, itemSize, normalized);
      }

      //

      if (this.index === null) {
        console.warn('THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed.');
        return this;
      }
      var geometry2 = new BufferGeometry();
      var indices = this.index.array;
      var attributes = this.attributes;

      // attributes

      for (var name in attributes) {
        var attribute = attributes[name];
        var newAttribute = convertBufferAttribute(attribute, indices);
        geometry2.setAttribute(name, newAttribute);
      }

      // morph attributes

      var morphAttributes = this.morphAttributes;
      for (var _name in morphAttributes) {
        var morphArray = [];
        var morphAttribute = morphAttributes[_name]; // morphAttribute: array of Float32BufferAttributes

        for (var i = 0, il = morphAttribute.length; i < il; i++) {
          var _attribute = morphAttribute[i];
          var _newAttribute = convertBufferAttribute(_attribute, indices);
          morphArray.push(_newAttribute);
        }
        geometry2.morphAttributes[_name] = morphArray;
      }
      geometry2.morphTargetsRelative = this.morphTargetsRelative;

      // groups

      var groups = this.groups;
      for (var _i7 = 0, l = groups.length; _i7 < l; _i7++) {
        var group = groups[_i7];
        geometry2.addGroup(group.start, group.count, group.materialIndex);
      }
      return geometry2;
    }
  }, {
    key: "toJSON",
    value: function toJSON() {
      var data = {
        metadata: {
          version: 4.5,
          type: 'BufferGeometry',
          generator: 'BufferGeometry.toJSON'
        }
      };

      // standard BufferGeometry serialization

      data.uuid = this.uuid;
      data.type = this.type;
      if (this.name !== '') data.name = this.name;
      if (Object.keys(this.userData).length > 0) data.userData = this.userData;
      if (this.parameters !== undefined) {
        var parameters = this.parameters;
        for (var key in parameters) {
          if (parameters[key] !== undefined) data[key] = parameters[key];
        }
        return data;
      }

      // for simplicity the code assumes attributes are not shared across geometries, see #15811

      data.data = {
        attributes: {}
      };
      var index = this.index;
      if (index !== null) {
        data.data.index = {
          type: index.array.constructor.name,
          array: Array.prototype.slice.call(index.array)
        };
      }
      var attributes = this.attributes;
      for (var _key in attributes) {
        var attribute = attributes[_key];
        data.data.attributes[_key] = attribute.toJSON(data.data);
      }
      var morphAttributes = {};
      var hasMorphAttributes = false;
      for (var _key2 in this.morphAttributes) {
        var attributeArray = this.morphAttributes[_key2];
        var array = [];
        for (var i = 0, il = attributeArray.length; i < il; i++) {
          var _attribute2 = attributeArray[i];
          array.push(_attribute2.toJSON(data.data));
        }
        if (array.length > 0) {
          morphAttributes[_key2] = array;
          hasMorphAttributes = true;
        }
      }
      if (hasMorphAttributes) {
        data.data.morphAttributes = morphAttributes;
        data.data.morphTargetsRelative = this.morphTargetsRelative;
      }
      var groups = this.groups;
      if (groups.length > 0) {
        data.data.groups = JSON.parse(JSON.stringify(groups));
      }
      var boundingSphere = this.boundingSphere;
      if (boundingSphere !== null) {
        data.data.boundingSphere = {
          center: boundingSphere.center.toArray(),
          radius: boundingSphere.radius
        };
      }
      return data;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor().copy(this);
    }
  }, {
    key: "copy",
    value: function copy(source) {
      // reset

      this.index = null;
      this.attributes = {};
      this.morphAttributes = {};
      this.groups = [];
      this.boundingBox = null;
      this.boundingSphere = null;

      // used for storing cloned, shared data

      var data = {};

      // name

      this.name = source.name;

      // index

      var index = source.index;
      if (index !== null) {
        this.setIndex(index.clone(data));
      }

      // attributes

      var attributes = source.attributes;
      for (var name in attributes) {
        var attribute = attributes[name];
        this.setAttribute(name, attribute.clone(data));
      }

      // morph attributes

      var morphAttributes = source.morphAttributes;
      for (var _name2 in morphAttributes) {
        var array = [];
        var morphAttribute = morphAttributes[_name2]; // morphAttribute: array of Float32BufferAttributes

        for (var i = 0, l = morphAttribute.length; i < l; i++) {
          array.push(morphAttribute[i].clone(data));
        }
        this.morphAttributes[_name2] = array;
      }
      this.morphTargetsRelative = source.morphTargetsRelative;

      // groups

      var groups = source.groups;
      for (var _i8 = 0, _l = groups.length; _i8 < _l; _i8++) {
        var group = groups[_i8];
        this.addGroup(group.start, group.count, group.materialIndex);
      }

      // bounding box

      var boundingBox = source.boundingBox;
      if (boundingBox !== null) {
        this.boundingBox = boundingBox.clone();
      }

      // bounding sphere

      var boundingSphere = source.boundingSphere;
      if (boundingSphere !== null) {
        this.boundingSphere = boundingSphere.clone();
      }

      // draw range

      this.drawRange.start = source.drawRange.start;
      this.drawRange.count = source.drawRange.count;

      // user data

      this.userData = source.userData;

      // geometry generator parameters

      if (source.parameters !== undefined) this.parameters = Object.assign({}, source.parameters);
      return this;
    }
  }, {
    key: "dispose",
    value: function dispose() {
      this.dispatchEvent({
        type: 'dispose'
      });
    }
  }]);
  return BufferGeometry;
}(_EventDispatcher2.EventDispatcher);
exports.BufferGeometry = BufferGeometry;
BufferGeometry.prototype.isBufferGeometry = true;
},{"../math/Box3.js":80,"../math/MathUtils.js":84,"../math/Matrix3.js":85,"../math/Matrix4.js":86,"../math/Sphere.js":88,"../math/Vector2.js":89,"../math/Vector3.js":90,"../utils.js":92,"./BufferAttribute.js":69,"./EventDispatcher.js":71,"./Object3D.js":73}],71:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.EventDispatcher = void 0;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
/**
 * https://github.com/mrdoob/eventdispatcher.js/
 */
var EventDispatcher = /*#__PURE__*/function () {
  function EventDispatcher() {
    _classCallCheck(this, EventDispatcher);
  }
  _createClass(EventDispatcher, [{
    key: "addEventListener",
    value: function addEventListener(type, listener) {
      if (this._listeners === undefined) this._listeners = {};
      var listeners = this._listeners;
      if (listeners[type] === undefined) {
        listeners[type] = [];
      }
      if (listeners[type].indexOf(listener) === -1) {
        listeners[type].push(listener);
      }
    }
  }, {
    key: "hasEventListener",
    value: function hasEventListener(type, listener) {
      if (this._listeners === undefined) return false;
      var listeners = this._listeners;
      return listeners[type] !== undefined && listeners[type].indexOf(listener) !== -1;
    }
  }, {
    key: "removeEventListener",
    value: function removeEventListener(type, listener) {
      if (this._listeners === undefined) return;
      var listeners = this._listeners;
      var listenerArray = listeners[type];
      if (listenerArray !== undefined) {
        var index = listenerArray.indexOf(listener);
        if (index !== -1) {
          listenerArray.splice(index, 1);
        }
      }
    }
  }, {
    key: "dispatchEvent",
    value: function dispatchEvent(event) {
      if (this._listeners === undefined) return;
      var listeners = this._listeners;
      var listenerArray = listeners[event.type];
      if (listenerArray !== undefined) {
        event.target = this;

        // Make a copy, in case listeners are removed while iterating.
        var array = listenerArray.slice(0);
        for (var i = 0, l = array.length; i < l; i++) {
          array[i].call(this, event);
        }
        event.target = null;
      }
    }
  }]);
  return EventDispatcher;
}();
exports.EventDispatcher = EventDispatcher;
},{}],72:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Layers = void 0;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Layers = /*#__PURE__*/function () {
  function Layers() {
    _classCallCheck(this, Layers);
    this.mask = 1 | 0;
  }
  _createClass(Layers, [{
    key: "set",
    value: function set(channel) {
      this.mask = (1 << channel | 0) >>> 0;
    }
  }, {
    key: "enable",
    value: function enable(channel) {
      this.mask |= 1 << channel | 0;
    }
  }, {
    key: "enableAll",
    value: function enableAll() {
      this.mask = 0xffffffff | 0;
    }
  }, {
    key: "toggle",
    value: function toggle(channel) {
      this.mask ^= 1 << channel | 0;
    }
  }, {
    key: "disable",
    value: function disable(channel) {
      this.mask &= ~(1 << channel | 0);
    }
  }, {
    key: "disableAll",
    value: function disableAll() {
      this.mask = 0;
    }
  }, {
    key: "test",
    value: function test(layers) {
      return (this.mask & layers.mask) !== 0;
    }
  }, {
    key: "isEnabled",
    value: function isEnabled(channel) {
      return (this.mask & (1 << channel | 0)) !== 0;
    }
  }]);
  return Layers;
}();
exports.Layers = Layers;
},{}],73:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Object3D = void 0;
var _Quaternion = require("../math/Quaternion.js");
var _Vector = require("../math/Vector3.js");
var _Matrix = require("../math/Matrix4.js");
var _EventDispatcher2 = require("./EventDispatcher.js");
var _Euler = require("../math/Euler.js");
var _Layers = require("./Layers.js");
var _Matrix2 = require("../math/Matrix3.js");
var MathUtils = _interopRequireWildcard(require("../math/MathUtils.js"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var _object3DId = 0;
var _v1 = /*@__PURE__*/new _Vector.Vector3();
var _q1 = /*@__PURE__*/new _Quaternion.Quaternion();
var _m1 = /*@__PURE__*/new _Matrix.Matrix4();
var _target = /*@__PURE__*/new _Vector.Vector3();
var _position = /*@__PURE__*/new _Vector.Vector3();
var _scale = /*@__PURE__*/new _Vector.Vector3();
var _quaternion = /*@__PURE__*/new _Quaternion.Quaternion();
var _xAxis = /*@__PURE__*/new _Vector.Vector3(1, 0, 0);
var _yAxis = /*@__PURE__*/new _Vector.Vector3(0, 1, 0);
var _zAxis = /*@__PURE__*/new _Vector.Vector3(0, 0, 1);
var _addedEvent = {
  type: 'added'
};
var _removedEvent = {
  type: 'removed'
};
var Object3D = /*#__PURE__*/function (_EventDispatcher) {
  _inherits(Object3D, _EventDispatcher);
  var _super = _createSuper(Object3D);
  function Object3D() {
    var _this;
    _classCallCheck(this, Object3D);
    _this = _super.call(this);
    Object.defineProperty(_assertThisInitialized(_this), 'id', {
      value: _object3DId++
    });
    _this.uuid = MathUtils.generateUUID();
    _this.name = '';
    _this.type = 'Object3D';
    _this.parent = null;
    _this.children = [];
    _this.up = Object3D.DefaultUp.clone();
    var position = new _Vector.Vector3();
    var rotation = new _Euler.Euler();
    var quaternion = new _Quaternion.Quaternion();
    var scale = new _Vector.Vector3(1, 1, 1);
    function onRotationChange() {
      quaternion.setFromEuler(rotation, false);
    }
    function onQuaternionChange() {
      rotation.setFromQuaternion(quaternion, undefined, false);
    }
    rotation._onChange(onRotationChange);
    quaternion._onChange(onQuaternionChange);
    Object.defineProperties(_assertThisInitialized(_this), {
      position: {
        configurable: true,
        enumerable: true,
        value: position
      },
      rotation: {
        configurable: true,
        enumerable: true,
        value: rotation
      },
      quaternion: {
        configurable: true,
        enumerable: true,
        value: quaternion
      },
      scale: {
        configurable: true,
        enumerable: true,
        value: scale
      },
      modelViewMatrix: {
        value: new _Matrix.Matrix4()
      },
      normalMatrix: {
        value: new _Matrix2.Matrix3()
      }
    });
    _this.matrix = new _Matrix.Matrix4();
    _this.matrixWorld = new _Matrix.Matrix4();
    _this.matrixAutoUpdate = Object3D.DefaultMatrixAutoUpdate;
    _this.matrixWorldNeedsUpdate = false;
    _this.layers = new _Layers.Layers();
    _this.visible = true;
    _this.castShadow = false;
    _this.receiveShadow = false;
    _this.frustumCulled = true;
    _this.renderOrder = 0;
    _this.animations = [];
    _this.userData = {};
    return _this;
  }
  _createClass(Object3D, [{
    key: "onBeforeRender",
    value: function onBeforeRender( /* renderer, scene, camera, geometry, material, group */) {}
  }, {
    key: "onAfterRender",
    value: function onAfterRender( /* renderer, scene, camera, geometry, material, group */) {}
  }, {
    key: "applyMatrix4",
    value: function applyMatrix4(matrix) {
      if (this.matrixAutoUpdate) this.updateMatrix();
      this.matrix.premultiply(matrix);
      this.matrix.decompose(this.position, this.quaternion, this.scale);
    }
  }, {
    key: "applyQuaternion",
    value: function applyQuaternion(q) {
      this.quaternion.premultiply(q);
      return this;
    }
  }, {
    key: "setRotationFromAxisAngle",
    value: function setRotationFromAxisAngle(axis, angle) {
      // assumes axis is normalized

      this.quaternion.setFromAxisAngle(axis, angle);
    }
  }, {
    key: "setRotationFromEuler",
    value: function setRotationFromEuler(euler) {
      this.quaternion.setFromEuler(euler, true);
    }
  }, {
    key: "setRotationFromMatrix",
    value: function setRotationFromMatrix(m) {
      // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

      this.quaternion.setFromRotationMatrix(m);
    }
  }, {
    key: "setRotationFromQuaternion",
    value: function setRotationFromQuaternion(q) {
      // assumes q is normalized

      this.quaternion.copy(q);
    }
  }, {
    key: "rotateOnAxis",
    value: function rotateOnAxis(axis, angle) {
      // rotate object on axis in object space
      // axis is assumed to be normalized

      _q1.setFromAxisAngle(axis, angle);
      this.quaternion.multiply(_q1);
      return this;
    }
  }, {
    key: "rotateOnWorldAxis",
    value: function rotateOnWorldAxis(axis, angle) {
      // rotate object on axis in world space
      // axis is assumed to be normalized
      // method assumes no rotated parent

      _q1.setFromAxisAngle(axis, angle);
      this.quaternion.premultiply(_q1);
      return this;
    }
  }, {
    key: "rotateX",
    value: function rotateX(angle) {
      return this.rotateOnAxis(_xAxis, angle);
    }
  }, {
    key: "rotateY",
    value: function rotateY(angle) {
      return this.rotateOnAxis(_yAxis, angle);
    }
  }, {
    key: "rotateZ",
    value: function rotateZ(angle) {
      return this.rotateOnAxis(_zAxis, angle);
    }
  }, {
    key: "translateOnAxis",
    value: function translateOnAxis(axis, distance) {
      // translate object by distance along axis in object space
      // axis is assumed to be normalized

      _v1.copy(axis).applyQuaternion(this.quaternion);
      this.position.add(_v1.multiplyScalar(distance));
      return this;
    }
  }, {
    key: "translateX",
    value: function translateX(distance) {
      return this.translateOnAxis(_xAxis, distance);
    }
  }, {
    key: "translateY",
    value: function translateY(distance) {
      return this.translateOnAxis(_yAxis, distance);
    }
  }, {
    key: "translateZ",
    value: function translateZ(distance) {
      return this.translateOnAxis(_zAxis, distance);
    }
  }, {
    key: "localToWorld",
    value: function localToWorld(vector) {
      return vector.applyMatrix4(this.matrixWorld);
    }
  }, {
    key: "worldToLocal",
    value: function worldToLocal(vector) {
      return vector.applyMatrix4(_m1.copy(this.matrixWorld).invert());
    }
  }, {
    key: "lookAt",
    value: function lookAt(x, y, z) {
      // This method does not support objects having non-uniformly-scaled parent(s)

      if (x.isVector3) {
        _target.copy(x);
      } else {
        _target.set(x, y, z);
      }
      var parent = this.parent;
      this.updateWorldMatrix(true, false);
      _position.setFromMatrixPosition(this.matrixWorld);
      if (this.isCamera || this.isLight) {
        _m1.lookAt(_position, _target, this.up);
      } else {
        _m1.lookAt(_target, _position, this.up);
      }
      this.quaternion.setFromRotationMatrix(_m1);
      if (parent) {
        _m1.extractRotation(parent.matrixWorld);
        _q1.setFromRotationMatrix(_m1);
        this.quaternion.premultiply(_q1.invert());
      }
    }
  }, {
    key: "add",
    value: function add(object) {
      if (arguments.length > 1) {
        for (var i = 0; i < arguments.length; i++) {
          this.add(arguments[i]);
        }
        return this;
      }
      if (object === this) {
        console.error('THREE.Object3D.add: object can\'t be added as a child of itself.', object);
        return this;
      }
      if (object && object.isObject3D) {
        if (object.parent !== null) {
          object.parent.remove(object);
        }
        object.parent = this;
        this.children.push(object);
        object.dispatchEvent(_addedEvent);
      } else {
        console.error('THREE.Object3D.add: object not an instance of THREE.Object3D.', object);
      }
      return this;
    }
  }, {
    key: "remove",
    value: function remove(object) {
      if (arguments.length > 1) {
        for (var i = 0; i < arguments.length; i++) {
          this.remove(arguments[i]);
        }
        return this;
      }
      var index = this.children.indexOf(object);
      if (index !== -1) {
        object.parent = null;
        this.children.splice(index, 1);
        object.dispatchEvent(_removedEvent);
      }
      return this;
    }
  }, {
    key: "removeFromParent",
    value: function removeFromParent() {
      var parent = this.parent;
      if (parent !== null) {
        parent.remove(this);
      }
      return this;
    }
  }, {
    key: "clear",
    value: function clear() {
      for (var i = 0; i < this.children.length; i++) {
        var object = this.children[i];
        object.parent = null;
        object.dispatchEvent(_removedEvent);
      }
      this.children.length = 0;
      return this;
    }
  }, {
    key: "attach",
    value: function attach(object) {
      // adds object as a child of this, while maintaining the object's world transform

      // Note: This method does not support scene graphs having non-uniformly-scaled nodes(s)

      this.updateWorldMatrix(true, false);
      _m1.copy(this.matrixWorld).invert();
      if (object.parent !== null) {
        object.parent.updateWorldMatrix(true, false);
        _m1.multiply(object.parent.matrixWorld);
      }
      object.applyMatrix4(_m1);
      this.add(object);
      object.updateWorldMatrix(false, true);
      return this;
    }
  }, {
    key: "getObjectById",
    value: function getObjectById(id) {
      return this.getObjectByProperty('id', id);
    }
  }, {
    key: "getObjectByName",
    value: function getObjectByName(name) {
      return this.getObjectByProperty('name', name);
    }
  }, {
    key: "getObjectByProperty",
    value: function getObjectByProperty(name, value) {
      if (this[name] === value) return this;
      for (var i = 0, l = this.children.length; i < l; i++) {
        var child = this.children[i];
        var object = child.getObjectByProperty(name, value);
        if (object !== undefined) {
          return object;
        }
      }
      return undefined;
    }
  }, {
    key: "getWorldPosition",
    value: function getWorldPosition(target) {
      this.updateWorldMatrix(true, false);
      return target.setFromMatrixPosition(this.matrixWorld);
    }
  }, {
    key: "getWorldQuaternion",
    value: function getWorldQuaternion(target) {
      this.updateWorldMatrix(true, false);
      this.matrixWorld.decompose(_position, target, _scale);
      return target;
    }
  }, {
    key: "getWorldScale",
    value: function getWorldScale(target) {
      this.updateWorldMatrix(true, false);
      this.matrixWorld.decompose(_position, _quaternion, target);
      return target;
    }
  }, {
    key: "getWorldDirection",
    value: function getWorldDirection(target) {
      this.updateWorldMatrix(true, false);
      var e = this.matrixWorld.elements;
      return target.set(e[8], e[9], e[10]).normalize();
    }
  }, {
    key: "raycast",
    value: function raycast( /* raycaster, intersects */) {}
  }, {
    key: "traverse",
    value: function traverse(callback) {
      callback(this);
      var children = this.children;
      for (var i = 0, l = children.length; i < l; i++) {
        children[i].traverse(callback);
      }
    }
  }, {
    key: "traverseVisible",
    value: function traverseVisible(callback) {
      if (this.visible === false) return;
      callback(this);
      var children = this.children;
      for (var i = 0, l = children.length; i < l; i++) {
        children[i].traverseVisible(callback);
      }
    }
  }, {
    key: "traverseAncestors",
    value: function traverseAncestors(callback) {
      var parent = this.parent;
      if (parent !== null) {
        callback(parent);
        parent.traverseAncestors(callback);
      }
    }
  }, {
    key: "updateMatrix",
    value: function updateMatrix() {
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.matrixWorldNeedsUpdate = true;
    }
  }, {
    key: "updateMatrixWorld",
    value: function updateMatrixWorld(force) {
      if (this.matrixAutoUpdate) this.updateMatrix();
      if (this.matrixWorldNeedsUpdate || force) {
        if (this.parent === null) {
          this.matrixWorld.copy(this.matrix);
        } else {
          this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
        }
        this.matrixWorldNeedsUpdate = false;
        force = true;
      }

      // update children

      var children = this.children;
      for (var i = 0, l = children.length; i < l; i++) {
        children[i].updateMatrixWorld(force);
      }
    }
  }, {
    key: "updateWorldMatrix",
    value: function updateWorldMatrix(updateParents, updateChildren) {
      var parent = this.parent;
      if (updateParents === true && parent !== null) {
        parent.updateWorldMatrix(true, false);
      }
      if (this.matrixAutoUpdate) this.updateMatrix();
      if (this.parent === null) {
        this.matrixWorld.copy(this.matrix);
      } else {
        this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      }

      // update children

      if (updateChildren === true) {
        var children = this.children;
        for (var i = 0, l = children.length; i < l; i++) {
          children[i].updateWorldMatrix(false, true);
        }
      }
    }
  }, {
    key: "toJSON",
    value: function toJSON(meta) {
      // meta is a string when called from JSON.stringify
      var isRootObject = meta === undefined || typeof meta === 'string';
      var output = {};

      // meta is a hash used to collect geometries, materials.
      // not providing it implies that this is the root object
      // being serialized.
      if (isRootObject) {
        // initialize meta obj
        meta = {
          geometries: {},
          materials: {},
          textures: {},
          images: {},
          shapes: {},
          skeletons: {},
          animations: {},
          nodes: {}
        };
        output.metadata = {
          version: 4.5,
          type: 'Object',
          generator: 'Object3D.toJSON'
        };
      }

      // standard Object3D serialization

      var object = {};
      object.uuid = this.uuid;
      object.type = this.type;
      if (this.name !== '') object.name = this.name;
      if (this.castShadow === true) object.castShadow = true;
      if (this.receiveShadow === true) object.receiveShadow = true;
      if (this.visible === false) object.visible = false;
      if (this.frustumCulled === false) object.frustumCulled = false;
      if (this.renderOrder !== 0) object.renderOrder = this.renderOrder;
      if (JSON.stringify(this.userData) !== '{}') object.userData = this.userData;
      object.layers = this.layers.mask;
      object.matrix = this.matrix.toArray();
      if (this.matrixAutoUpdate === false) object.matrixAutoUpdate = false;

      // object specific properties

      if (this.isInstancedMesh) {
        object.type = 'InstancedMesh';
        object.count = this.count;
        object.instanceMatrix = this.instanceMatrix.toJSON();
        if (this.instanceColor !== null) object.instanceColor = this.instanceColor.toJSON();
      }

      //

      function serialize(library, element) {
        if (library[element.uuid] === undefined) {
          library[element.uuid] = element.toJSON(meta);
        }
        return element.uuid;
      }
      if (this.isScene) {
        if (this.background) {
          if (this.background.isColor) {
            object.background = this.background.toJSON();
          } else if (this.background.isTexture) {
            object.background = this.background.toJSON(meta).uuid;
          }
        }
        if (this.environment && this.environment.isTexture) {
          object.environment = this.environment.toJSON(meta).uuid;
        }
      } else if (this.isMesh || this.isLine || this.isPoints) {
        object.geometry = serialize(meta.geometries, this.geometry);
        var parameters = this.geometry.parameters;
        if (parameters !== undefined && parameters.shapes !== undefined) {
          var shapes = parameters.shapes;
          if (Array.isArray(shapes)) {
            for (var i = 0, l = shapes.length; i < l; i++) {
              var shape = shapes[i];
              serialize(meta.shapes, shape);
            }
          } else {
            serialize(meta.shapes, shapes);
          }
        }
      }
      if (this.isSkinnedMesh) {
        object.bindMode = this.bindMode;
        object.bindMatrix = this.bindMatrix.toArray();
        if (this.skeleton !== undefined) {
          serialize(meta.skeletons, this.skeleton);
          object.skeleton = this.skeleton.uuid;
        }
      }
      if (this.material !== undefined) {
        if (Array.isArray(this.material)) {
          var uuids = [];
          for (var _i = 0, _l = this.material.length; _i < _l; _i++) {
            uuids.push(serialize(meta.materials, this.material[_i]));
          }
          object.material = uuids;
        } else {
          object.material = serialize(meta.materials, this.material);
        }
      }

      //

      if (this.children.length > 0) {
        object.children = [];
        for (var _i2 = 0; _i2 < this.children.length; _i2++) {
          object.children.push(this.children[_i2].toJSON(meta).object);
        }
      }

      //

      if (this.animations.length > 0) {
        object.animations = [];
        for (var _i3 = 0; _i3 < this.animations.length; _i3++) {
          var animation = this.animations[_i3];
          object.animations.push(serialize(meta.animations, animation));
        }
      }
      if (isRootObject) {
        var geometries = extractFromCache(meta.geometries);
        var materials = extractFromCache(meta.materials);
        var textures = extractFromCache(meta.textures);
        var images = extractFromCache(meta.images);
        var _shapes = extractFromCache(meta.shapes);
        var skeletons = extractFromCache(meta.skeletons);
        var animations = extractFromCache(meta.animations);
        var nodes = extractFromCache(meta.nodes);
        if (geometries.length > 0) output.geometries = geometries;
        if (materials.length > 0) output.materials = materials;
        if (textures.length > 0) output.textures = textures;
        if (images.length > 0) output.images = images;
        if (_shapes.length > 0) output.shapes = _shapes;
        if (skeletons.length > 0) output.skeletons = skeletons;
        if (animations.length > 0) output.animations = animations;
        if (nodes.length > 0) output.nodes = nodes;
      }
      output.object = object;
      return output;

      // extract data from the cache hash
      // remove metadata on each item
      // and return as array
      function extractFromCache(cache) {
        var values = [];
        for (var key in cache) {
          var data = cache[key];
          delete data.metadata;
          values.push(data);
        }
        return values;
      }
    }
  }, {
    key: "clone",
    value: function clone(recursive) {
      return new this.constructor().copy(this, recursive);
    }
  }, {
    key: "copy",
    value: function copy(source) {
      var recursive = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : true;
      this.name = source.name;
      this.up.copy(source.up);
      this.position.copy(source.position);
      this.rotation.order = source.rotation.order;
      this.quaternion.copy(source.quaternion);
      this.scale.copy(source.scale);
      this.matrix.copy(source.matrix);
      this.matrixWorld.copy(source.matrixWorld);
      this.matrixAutoUpdate = source.matrixAutoUpdate;
      this.matrixWorldNeedsUpdate = source.matrixWorldNeedsUpdate;
      this.layers.mask = source.layers.mask;
      this.visible = source.visible;
      this.castShadow = source.castShadow;
      this.receiveShadow = source.receiveShadow;
      this.frustumCulled = source.frustumCulled;
      this.renderOrder = source.renderOrder;
      this.userData = JSON.parse(JSON.stringify(source.userData));
      if (recursive === true) {
        for (var i = 0; i < source.children.length; i++) {
          var child = source.children[i];
          this.add(child.clone());
        }
      }
      return this;
    }
  }]);
  return Object3D;
}(_EventDispatcher2.EventDispatcher);
exports.Object3D = Object3D;
Object3D.DefaultUp = new _Vector.Vector3(0, 1, 0);
Object3D.DefaultMatrixAutoUpdate = true;
Object3D.prototype.isObject3D = true;
},{"../math/Euler.js":83,"../math/MathUtils.js":84,"../math/Matrix3.js":85,"../math/Matrix4.js":86,"../math/Quaternion.js":87,"../math/Vector3.js":90,"./EventDispatcher.js":71,"./Layers.js":72}],74:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Cache = void 0;
var Cache = {
  enabled: false,
  files: {},
  add: function add(key, file) {
    if (this.enabled === false) return;

    // console.log( 'THREE.Cache', 'Adding key:', key );

    this.files[key] = file;
  },
  get: function get(key) {
    if (this.enabled === false) return;

    // console.log( 'THREE.Cache', 'Checking key:', key );

    return this.files[key];
  },
  remove: function remove(key) {
    delete this.files[key];
  },
  clear: function clear() {
    this.files = {};
  }
};
exports.Cache = Cache;
},{}],75:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FileLoader = void 0;
var _Cache = require("./Cache.js");
var _Loader2 = require("./Loader.js");
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var loading = {};
var FileLoader = /*#__PURE__*/function (_Loader) {
  _inherits(FileLoader, _Loader);
  var _super = _createSuper(FileLoader);
  function FileLoader(manager) {
    _classCallCheck(this, FileLoader);
    return _super.call(this, manager);
  }
  _createClass(FileLoader, [{
    key: "load",
    value: function load(url, onLoad, onProgress, onError) {
      var _this = this;
      if (url === undefined) url = '';
      if (this.path !== undefined) url = this.path + url;
      url = this.manager.resolveURL(url);
      var cached = _Cache.Cache.get(url);
      if (cached !== undefined) {
        this.manager.itemStart(url);
        setTimeout(function () {
          if (onLoad) onLoad(cached);
          _this.manager.itemEnd(url);
        }, 0);
        return cached;
      }

      // Check if request is duplicate

      if (loading[url] !== undefined) {
        loading[url].push({
          onLoad: onLoad,
          onProgress: onProgress,
          onError: onError
        });
        return;
      }

      // Initialise array for duplicate requests
      loading[url] = [];
      loading[url].push({
        onLoad: onLoad,
        onProgress: onProgress,
        onError: onError
      });

      // create request
      var req = new Request(url, {
        headers: new Headers(this.requestHeader),
        credentials: this.withCredentials ? 'include' : 'same-origin'
        // An abort controller could be added within a future PR
      });

      // record states ( avoid data race )
      var mimeType = this.mimeType;
      var responseType = this.responseType;

      // start the fetch
      fetch(req).then(function (response) {
        if (response.status === 200 || response.status === 0) {
          // Some browsers return HTTP Status 0 when using non-http protocol
          // e.g. 'file://' or 'data://'. Handle as success.

          if (response.status === 0) {
            console.warn('THREE.FileLoader: HTTP Status 0 received.');
          }

          // Workaround: Checking if response.body === undefined for Alipay browser #23548

          if (typeof ReadableStream === 'undefined' || response.body === undefined || response.body.getReader === undefined) {
            return response;
          }
          var callbacks = loading[url];
          var reader = response.body.getReader();
          var contentLength = response.headers.get('Content-Length');
          var total = contentLength ? parseInt(contentLength) : 0;
          var lengthComputable = total !== 0;
          var loaded = 0;

          // periodically read data into the new stream tracking while download progress
          var stream = new ReadableStream({
            start: function start(controller) {
              readData();
              function readData() {
                reader.read().then(function (_ref) {
                  var done = _ref.done,
                    value = _ref.value;
                  if (done) {
                    controller.close();
                  } else {
                    loaded += value.byteLength;
                    var event = new ProgressEvent('progress', {
                      lengthComputable: lengthComputable,
                      loaded: loaded,
                      total: total
                    });
                    for (var i = 0, il = callbacks.length; i < il; i++) {
                      var callback = callbacks[i];
                      if (callback.onProgress) callback.onProgress(event);
                    }
                    controller.enqueue(value);
                    readData();
                  }
                });
              }
            }
          });
          return new Response(stream);
        } else {
          throw Error("fetch for \"".concat(response.url, "\" responded with ").concat(response.status, ": ").concat(response.statusText));
        }
      }).then(function (response) {
        switch (responseType) {
          case 'arraybuffer':
            return response.arrayBuffer();
          case 'blob':
            return response.blob();
          case 'document':
            return response.text().then(function (text) {
              var parser = new DOMParser();
              return parser.parseFromString(text, mimeType);
            });
          case 'json':
            return response.json();
          default:
            if (mimeType === undefined) {
              return response.text();
            } else {
              // sniff encoding
              var re = /charset="?([^;"\s]*)"?/i;
              var exec = re.exec(mimeType);
              var label = exec && exec[1] ? exec[1].toLowerCase() : undefined;
              var decoder = new TextDecoder(label);
              return response.arrayBuffer().then(function (ab) {
                return decoder.decode(ab);
              });
            }
        }
      }).then(function (data) {
        // Add to cache only on HTTP success, so that we do not cache
        // error response bodies as proper responses to requests.
        _Cache.Cache.add(url, data);
        var callbacks = loading[url];
        delete loading[url];
        for (var i = 0, il = callbacks.length; i < il; i++) {
          var callback = callbacks[i];
          if (callback.onLoad) callback.onLoad(data);
        }
      }).catch(function (err) {
        // Abort errors and other errors are handled the same

        var callbacks = loading[url];
        if (callbacks === undefined) {
          // When onLoad was called and url was deleted in `loading`
          _this.manager.itemError(url);
          throw err;
        }
        delete loading[url];
        for (var i = 0, il = callbacks.length; i < il; i++) {
          var callback = callbacks[i];
          if (callback.onError) callback.onError(err);
        }
        _this.manager.itemError(url);
      }).finally(function () {
        _this.manager.itemEnd(url);
      });
      this.manager.itemStart(url);
    }
  }, {
    key: "setResponseType",
    value: function setResponseType(value) {
      this.responseType = value;
      return this;
    }
  }, {
    key: "setMimeType",
    value: function setMimeType(value) {
      this.mimeType = value;
      return this;
    }
  }]);
  return FileLoader;
}(_Loader2.Loader);
exports.FileLoader = FileLoader;
},{"./Cache.js":74,"./Loader.js":76}],76:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Loader = void 0;
var _LoadingManager = require("./LoadingManager.js");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Loader = /*#__PURE__*/function () {
  function Loader(manager) {
    _classCallCheck(this, Loader);
    this.manager = manager !== undefined ? manager : _LoadingManager.DefaultLoadingManager;
    this.crossOrigin = 'anonymous';
    this.withCredentials = false;
    this.path = '';
    this.resourcePath = '';
    this.requestHeader = {};
  }
  _createClass(Loader, [{
    key: "load",
    value: function load( /* url, onLoad, onProgress, onError */) {}
  }, {
    key: "loadAsync",
    value: function loadAsync(url, onProgress) {
      var scope = this;
      return new Promise(function (resolve, reject) {
        scope.load(url, resolve, onProgress, reject);
      });
    }
  }, {
    key: "parse",
    value: function parse( /* data */) {}
  }, {
    key: "setCrossOrigin",
    value: function setCrossOrigin(crossOrigin) {
      this.crossOrigin = crossOrigin;
      return this;
    }
  }, {
    key: "setWithCredentials",
    value: function setWithCredentials(value) {
      this.withCredentials = value;
      return this;
    }
  }, {
    key: "setPath",
    value: function setPath(path) {
      this.path = path;
      return this;
    }
  }, {
    key: "setResourcePath",
    value: function setResourcePath(resourcePath) {
      this.resourcePath = resourcePath;
      return this;
    }
  }, {
    key: "setRequestHeader",
    value: function setRequestHeader(requestHeader) {
      this.requestHeader = requestHeader;
      return this;
    }
  }]);
  return Loader;
}();
exports.Loader = Loader;
},{"./LoadingManager.js":77}],77:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LoadingManager = exports.DefaultLoadingManager = void 0;
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
var LoadingManager = /*#__PURE__*/_createClass(function LoadingManager(onLoad, onProgress, onError) {
  _classCallCheck(this, LoadingManager);
  var scope = this;
  var isLoading = false;
  var itemsLoaded = 0;
  var itemsTotal = 0;
  var urlModifier = undefined;
  var handlers = [];

  // Refer to #5689 for the reason why we don't set .onStart
  // in the constructor

  this.onStart = undefined;
  this.onLoad = onLoad;
  this.onProgress = onProgress;
  this.onError = onError;
  this.itemStart = function (url) {
    itemsTotal++;
    if (isLoading === false) {
      if (scope.onStart !== undefined) {
        scope.onStart(url, itemsLoaded, itemsTotal);
      }
    }
    isLoading = true;
  };
  this.itemEnd = function (url) {
    itemsLoaded++;
    if (scope.onProgress !== undefined) {
      scope.onProgress(url, itemsLoaded, itemsTotal);
    }
    if (itemsLoaded === itemsTotal) {
      isLoading = false;
      if (scope.onLoad !== undefined) {
        scope.onLoad();
      }
    }
  };
  this.itemError = function (url) {
    if (scope.onError !== undefined) {
      scope.onError(url);
    }
  };
  this.resolveURL = function (url) {
    if (urlModifier) {
      return urlModifier(url);
    }
    return url;
  };
  this.setURLModifier = function (transform) {
    urlModifier = transform;
    return this;
  };
  this.addHandler = function (regex, loader) {
    handlers.push(regex, loader);
    return this;
  };
  this.removeHandler = function (regex) {
    var index = handlers.indexOf(regex);
    if (index !== -1) {
      handlers.splice(index, 2);
    }
    return this;
  };
  this.getHandler = function (file) {
    for (var i = 0, l = handlers.length; i < l; i += 2) {
      var regex = handlers[i];
      var loader = handlers[i + 1];
      if (regex.global) regex.lastIndex = 0; // see #17920

      if (regex.test(file)) {
        return loader;
      }
    }
    return null;
  };
});
exports.LoadingManager = LoadingManager;
var DefaultLoadingManager = new LoadingManager();
exports.DefaultLoadingManager = DefaultLoadingManager;
},{}],78:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Material = void 0;
var _EventDispatcher2 = require("../core/EventDispatcher.js");
var _constants = require("../constants.js");
var MathUtils = _interopRequireWildcard(require("../math/MathUtils.js"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var materialId = 0;
var Material = /*#__PURE__*/function (_EventDispatcher) {
  _inherits(Material, _EventDispatcher);
  var _super = _createSuper(Material);
  function Material() {
    var _this;
    _classCallCheck(this, Material);
    _this = _super.call(this);
    Object.defineProperty(_assertThisInitialized(_this), 'id', {
      value: materialId++
    });
    _this.uuid = MathUtils.generateUUID();
    _this.name = '';
    _this.type = 'Material';
    _this.fog = true;
    _this.blending = _constants.NormalBlending;
    _this.side = _constants.FrontSide;
    _this.vertexColors = false;
    _this.opacity = 1;
    _this.transparent = false;
    _this.blendSrc = _constants.SrcAlphaFactor;
    _this.blendDst = _constants.OneMinusSrcAlphaFactor;
    _this.blendEquation = _constants.AddEquation;
    _this.blendSrcAlpha = null;
    _this.blendDstAlpha = null;
    _this.blendEquationAlpha = null;
    _this.depthFunc = _constants.LessEqualDepth;
    _this.depthTest = true;
    _this.depthWrite = true;
    _this.stencilWriteMask = 0xff;
    _this.stencilFunc = _constants.AlwaysStencilFunc;
    _this.stencilRef = 0;
    _this.stencilFuncMask = 0xff;
    _this.stencilFail = _constants.KeepStencilOp;
    _this.stencilZFail = _constants.KeepStencilOp;
    _this.stencilZPass = _constants.KeepStencilOp;
    _this.stencilWrite = false;
    _this.clippingPlanes = null;
    _this.clipIntersection = false;
    _this.clipShadows = false;
    _this.shadowSide = null;
    _this.colorWrite = true;
    _this.precision = null; // override the renderer's default precision for this material

    _this.polygonOffset = false;
    _this.polygonOffsetFactor = 0;
    _this.polygonOffsetUnits = 0;
    _this.dithering = false;
    _this.alphaToCoverage = false;
    _this.premultipliedAlpha = false;
    _this.visible = true;
    _this.toneMapped = true;
    _this.userData = {};
    _this.version = 0;
    _this._alphaTest = 0;
    return _this;
  }
  _createClass(Material, [{
    key: "alphaTest",
    get: function get() {
      return this._alphaTest;
    },
    set: function set(value) {
      if (this._alphaTest > 0 !== value > 0) {
        this.version++;
      }
      this._alphaTest = value;
    }
  }, {
    key: "onBuild",
    value: function onBuild( /* shaderobject, renderer */) {}
  }, {
    key: "onBeforeRender",
    value: function onBeforeRender( /* renderer, scene, camera, geometry, object, group */) {}
  }, {
    key: "onBeforeCompile",
    value: function onBeforeCompile( /* shaderobject, renderer */) {}
  }, {
    key: "customProgramCacheKey",
    value: function customProgramCacheKey() {
      return this.onBeforeCompile.toString();
    }
  }, {
    key: "setValues",
    value: function setValues(values) {
      if (values === undefined) return;
      for (var key in values) {
        var newValue = values[key];
        if (newValue === undefined) {
          console.warn('THREE.Material: \'' + key + '\' parameter is undefined.');
          continue;
        }

        // for backward compatibility if shading is set in the constructor
        if (key === 'shading') {
          console.warn('THREE.' + this.type + ': .shading has been removed. Use the boolean .flatShading instead.');
          this.flatShading = newValue === _constants.FlatShading ? true : false;
          continue;
        }
        var currentValue = this[key];
        if (currentValue === undefined) {
          console.warn('THREE.' + this.type + ': \'' + key + '\' is not a property of this material.');
          continue;
        }
        if (currentValue && currentValue.isColor) {
          currentValue.set(newValue);
        } else if (currentValue && currentValue.isVector3 && newValue && newValue.isVector3) {
          currentValue.copy(newValue);
        } else {
          this[key] = newValue;
        }
      }
    }
  }, {
    key: "toJSON",
    value: function toJSON(meta) {
      var isRootObject = meta === undefined || typeof meta === 'string';
      if (isRootObject) {
        meta = {
          textures: {},
          images: {}
        };
      }
      var data = {
        metadata: {
          version: 4.5,
          type: 'Material',
          generator: 'Material.toJSON'
        }
      };

      // standard Material serialization
      data.uuid = this.uuid;
      data.type = this.type;
      if (this.name !== '') data.name = this.name;
      if (this.color && this.color.isColor) data.color = this.color.getHex();
      if (this.roughness !== undefined) data.roughness = this.roughness;
      if (this.metalness !== undefined) data.metalness = this.metalness;
      if (this.sheen !== undefined) data.sheen = this.sheen;
      if (this.sheenColor && this.sheenColor.isColor) data.sheenColor = this.sheenColor.getHex();
      if (this.sheenRoughness !== undefined) data.sheenRoughness = this.sheenRoughness;
      if (this.emissive && this.emissive.isColor) data.emissive = this.emissive.getHex();
      if (this.emissiveIntensity && this.emissiveIntensity !== 1) data.emissiveIntensity = this.emissiveIntensity;
      if (this.specular && this.specular.isColor) data.specular = this.specular.getHex();
      if (this.specularIntensity !== undefined) data.specularIntensity = this.specularIntensity;
      if (this.specularColor && this.specularColor.isColor) data.specularColor = this.specularColor.getHex();
      if (this.shininess !== undefined) data.shininess = this.shininess;
      if (this.clearcoat !== undefined) data.clearcoat = this.clearcoat;
      if (this.clearcoatRoughness !== undefined) data.clearcoatRoughness = this.clearcoatRoughness;
      if (this.clearcoatMap && this.clearcoatMap.isTexture) {
        data.clearcoatMap = this.clearcoatMap.toJSON(meta).uuid;
      }
      if (this.clearcoatRoughnessMap && this.clearcoatRoughnessMap.isTexture) {
        data.clearcoatRoughnessMap = this.clearcoatRoughnessMap.toJSON(meta).uuid;
      }
      if (this.clearcoatNormalMap && this.clearcoatNormalMap.isTexture) {
        data.clearcoatNormalMap = this.clearcoatNormalMap.toJSON(meta).uuid;
        data.clearcoatNormalScale = this.clearcoatNormalScale.toArray();
      }
      if (this.map && this.map.isTexture) data.map = this.map.toJSON(meta).uuid;
      if (this.matcap && this.matcap.isTexture) data.matcap = this.matcap.toJSON(meta).uuid;
      if (this.alphaMap && this.alphaMap.isTexture) data.alphaMap = this.alphaMap.toJSON(meta).uuid;
      if (this.lightMap && this.lightMap.isTexture) {
        data.lightMap = this.lightMap.toJSON(meta).uuid;
        data.lightMapIntensity = this.lightMapIntensity;
      }
      if (this.aoMap && this.aoMap.isTexture) {
        data.aoMap = this.aoMap.toJSON(meta).uuid;
        data.aoMapIntensity = this.aoMapIntensity;
      }
      if (this.bumpMap && this.bumpMap.isTexture) {
        data.bumpMap = this.bumpMap.toJSON(meta).uuid;
        data.bumpScale = this.bumpScale;
      }
      if (this.normalMap && this.normalMap.isTexture) {
        data.normalMap = this.normalMap.toJSON(meta).uuid;
        data.normalMapType = this.normalMapType;
        data.normalScale = this.normalScale.toArray();
      }
      if (this.displacementMap && this.displacementMap.isTexture) {
        data.displacementMap = this.displacementMap.toJSON(meta).uuid;
        data.displacementScale = this.displacementScale;
        data.displacementBias = this.displacementBias;
      }
      if (this.roughnessMap && this.roughnessMap.isTexture) data.roughnessMap = this.roughnessMap.toJSON(meta).uuid;
      if (this.metalnessMap && this.metalnessMap.isTexture) data.metalnessMap = this.metalnessMap.toJSON(meta).uuid;
      if (this.emissiveMap && this.emissiveMap.isTexture) data.emissiveMap = this.emissiveMap.toJSON(meta).uuid;
      if (this.specularMap && this.specularMap.isTexture) data.specularMap = this.specularMap.toJSON(meta).uuid;
      if (this.specularIntensityMap && this.specularIntensityMap.isTexture) data.specularIntensityMap = this.specularIntensityMap.toJSON(meta).uuid;
      if (this.specularColorMap && this.specularColorMap.isTexture) data.specularColorMap = this.specularColorMap.toJSON(meta).uuid;
      if (this.envMap && this.envMap.isTexture) {
        data.envMap = this.envMap.toJSON(meta).uuid;
        if (this.combine !== undefined) data.combine = this.combine;
      }
      if (this.envMapIntensity !== undefined) data.envMapIntensity = this.envMapIntensity;
      if (this.reflectivity !== undefined) data.reflectivity = this.reflectivity;
      if (this.refractionRatio !== undefined) data.refractionRatio = this.refractionRatio;
      if (this.gradientMap && this.gradientMap.isTexture) {
        data.gradientMap = this.gradientMap.toJSON(meta).uuid;
      }
      if (this.transmission !== undefined) data.transmission = this.transmission;
      if (this.transmissionMap && this.transmissionMap.isTexture) data.transmissionMap = this.transmissionMap.toJSON(meta).uuid;
      if (this.thickness !== undefined) data.thickness = this.thickness;
      if (this.thicknessMap && this.thicknessMap.isTexture) data.thicknessMap = this.thicknessMap.toJSON(meta).uuid;
      if (this.attenuationDistance !== undefined) data.attenuationDistance = this.attenuationDistance;
      if (this.attenuationColor !== undefined) data.attenuationColor = this.attenuationColor.getHex();
      if (this.size !== undefined) data.size = this.size;
      if (this.shadowSide !== null) data.shadowSide = this.shadowSide;
      if (this.sizeAttenuation !== undefined) data.sizeAttenuation = this.sizeAttenuation;
      if (this.blending !== _constants.NormalBlending) data.blending = this.blending;
      if (this.side !== _constants.FrontSide) data.side = this.side;
      if (this.vertexColors) data.vertexColors = true;
      if (this.opacity < 1) data.opacity = this.opacity;
      if (this.transparent === true) data.transparent = this.transparent;
      data.depthFunc = this.depthFunc;
      data.depthTest = this.depthTest;
      data.depthWrite = this.depthWrite;
      data.colorWrite = this.colorWrite;
      data.stencilWrite = this.stencilWrite;
      data.stencilWriteMask = this.stencilWriteMask;
      data.stencilFunc = this.stencilFunc;
      data.stencilRef = this.stencilRef;
      data.stencilFuncMask = this.stencilFuncMask;
      data.stencilFail = this.stencilFail;
      data.stencilZFail = this.stencilZFail;
      data.stencilZPass = this.stencilZPass;

      // rotation (SpriteMaterial)
      if (this.rotation !== undefined && this.rotation !== 0) data.rotation = this.rotation;
      if (this.polygonOffset === true) data.polygonOffset = true;
      if (this.polygonOffsetFactor !== 0) data.polygonOffsetFactor = this.polygonOffsetFactor;
      if (this.polygonOffsetUnits !== 0) data.polygonOffsetUnits = this.polygonOffsetUnits;
      if (this.linewidth !== undefined && this.linewidth !== 1) data.linewidth = this.linewidth;
      if (this.dashSize !== undefined) data.dashSize = this.dashSize;
      if (this.gapSize !== undefined) data.gapSize = this.gapSize;
      if (this.scale !== undefined) data.scale = this.scale;
      if (this.dithering === true) data.dithering = true;
      if (this.alphaTest > 0) data.alphaTest = this.alphaTest;
      if (this.alphaToCoverage === true) data.alphaToCoverage = this.alphaToCoverage;
      if (this.premultipliedAlpha === true) data.premultipliedAlpha = this.premultipliedAlpha;
      if (this.wireframe === true) data.wireframe = this.wireframe;
      if (this.wireframeLinewidth > 1) data.wireframeLinewidth = this.wireframeLinewidth;
      if (this.wireframeLinecap !== 'round') data.wireframeLinecap = this.wireframeLinecap;
      if (this.wireframeLinejoin !== 'round') data.wireframeLinejoin = this.wireframeLinejoin;
      if (this.flatShading === true) data.flatShading = this.flatShading;
      if (this.visible === false) data.visible = false;
      if (this.toneMapped === false) data.toneMapped = false;
      if (JSON.stringify(this.userData) !== '{}') data.userData = this.userData;

      // TODO: Copied from Object3D.toJSON

      function extractFromCache(cache) {
        var values = [];
        for (var key in cache) {
          var _data = cache[key];
          delete _data.metadata;
          values.push(_data);
        }
        return values;
      }
      if (isRootObject) {
        var textures = extractFromCache(meta.textures);
        var images = extractFromCache(meta.images);
        if (textures.length > 0) data.textures = textures;
        if (images.length > 0) data.images = images;
      }
      return data;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor().copy(this);
    }
  }, {
    key: "copy",
    value: function copy(source) {
      this.name = source.name;
      this.fog = source.fog;
      this.blending = source.blending;
      this.side = source.side;
      this.vertexColors = source.vertexColors;
      this.opacity = source.opacity;
      this.transparent = source.transparent;
      this.blendSrc = source.blendSrc;
      this.blendDst = source.blendDst;
      this.blendEquation = source.blendEquation;
      this.blendSrcAlpha = source.blendSrcAlpha;
      this.blendDstAlpha = source.blendDstAlpha;
      this.blendEquationAlpha = source.blendEquationAlpha;
      this.depthFunc = source.depthFunc;
      this.depthTest = source.depthTest;
      this.depthWrite = source.depthWrite;
      this.stencilWriteMask = source.stencilWriteMask;
      this.stencilFunc = source.stencilFunc;
      this.stencilRef = source.stencilRef;
      this.stencilFuncMask = source.stencilFuncMask;
      this.stencilFail = source.stencilFail;
      this.stencilZFail = source.stencilZFail;
      this.stencilZPass = source.stencilZPass;
      this.stencilWrite = source.stencilWrite;
      var srcPlanes = source.clippingPlanes;
      var dstPlanes = null;
      if (srcPlanes !== null) {
        var n = srcPlanes.length;
        dstPlanes = new Array(n);
        for (var i = 0; i !== n; ++i) {
          dstPlanes[i] = srcPlanes[i].clone();
        }
      }
      this.clippingPlanes = dstPlanes;
      this.clipIntersection = source.clipIntersection;
      this.clipShadows = source.clipShadows;
      this.shadowSide = source.shadowSide;
      this.colorWrite = source.colorWrite;
      this.precision = source.precision;
      this.polygonOffset = source.polygonOffset;
      this.polygonOffsetFactor = source.polygonOffsetFactor;
      this.polygonOffsetUnits = source.polygonOffsetUnits;
      this.dithering = source.dithering;
      this.alphaTest = source.alphaTest;
      this.alphaToCoverage = source.alphaToCoverage;
      this.premultipliedAlpha = source.premultipliedAlpha;
      this.visible = source.visible;
      this.toneMapped = source.toneMapped;
      this.userData = JSON.parse(JSON.stringify(source.userData));
      return this;
    }
  }, {
    key: "dispose",
    value: function dispose() {
      this.dispatchEvent({
        type: 'dispose'
      });
    }
  }, {
    key: "needsUpdate",
    set: function set(value) {
      if (value === true) this.version++;
    }
  }]);
  return Material;
}(_EventDispatcher2.EventDispatcher);
exports.Material = Material;
Material.prototype.isMaterial = true;
Material.fromType = function /*type*/
() {
  // TODO: Behavior added in Materials.js

  return null;
};
},{"../constants.js":68,"../core/EventDispatcher.js":71,"../math/MathUtils.js":84}],79:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MeshPhongMaterial = void 0;
var _constants = require("../constants.js");
var _Material2 = require("./Material.js");
var _Vector = require("../math/Vector2.js");
var _Color = require("../math/Color.js");
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _get() { if (typeof Reflect !== "undefined" && Reflect.get) { _get = Reflect.get.bind(); } else { _get = function _get(target, property, receiver) { var base = _superPropBase(target, property); if (!base) return; var desc = Object.getOwnPropertyDescriptor(base, property); if (desc.get) { return desc.get.call(arguments.length < 3 ? target : receiver); } return desc.value; }; } return _get.apply(this, arguments); }
function _superPropBase(object, property) { while (!Object.prototype.hasOwnProperty.call(object, property)) { object = _getPrototypeOf(object); if (object === null) break; } return object; }
function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function"); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, writable: true, configurable: true } }); Object.defineProperty(subClass, "prototype", { writable: false }); if (superClass) _setPrototypeOf(subClass, superClass); }
function _setPrototypeOf(o, p) { _setPrototypeOf = Object.setPrototypeOf ? Object.setPrototypeOf.bind() : function _setPrototypeOf(o, p) { o.__proto__ = p; return o; }; return _setPrototypeOf(o, p); }
function _createSuper(Derived) { var hasNativeReflectConstruct = _isNativeReflectConstruct(); return function _createSuperInternal() { var Super = _getPrototypeOf(Derived), result; if (hasNativeReflectConstruct) { var NewTarget = _getPrototypeOf(this).constructor; result = Reflect.construct(Super, arguments, NewTarget); } else { result = Super.apply(this, arguments); } return _possibleConstructorReturn(this, result); }; }
function _possibleConstructorReturn(self, call) { if (call && (_typeof(call) === "object" || typeof call === "function")) { return call; } else if (call !== void 0) { throw new TypeError("Derived constructors may only return object or undefined"); } return _assertThisInitialized(self); }
function _assertThisInitialized(self) { if (self === void 0) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return self; }
function _isNativeReflectConstruct() { if (typeof Reflect === "undefined" || !Reflect.construct) return false; if (Reflect.construct.sham) return false; if (typeof Proxy === "function") return true; try { Boolean.prototype.valueOf.call(Reflect.construct(Boolean, [], function () {})); return true; } catch (e) { return false; } }
function _getPrototypeOf(o) { _getPrototypeOf = Object.setPrototypeOf ? Object.getPrototypeOf.bind() : function _getPrototypeOf(o) { return o.__proto__ || Object.getPrototypeOf(o); }; return _getPrototypeOf(o); }
var MeshPhongMaterial = /*#__PURE__*/function (_Material) {
  _inherits(MeshPhongMaterial, _Material);
  var _super = _createSuper(MeshPhongMaterial);
  function MeshPhongMaterial(parameters) {
    var _this;
    _classCallCheck(this, MeshPhongMaterial);
    _this = _super.call(this);
    _this.type = 'MeshPhongMaterial';
    _this.color = new _Color.Color(0xffffff); // diffuse
    _this.specular = new _Color.Color(0x111111);
    _this.shininess = 30;
    _this.map = null;
    _this.lightMap = null;
    _this.lightMapIntensity = 1.0;
    _this.aoMap = null;
    _this.aoMapIntensity = 1.0;
    _this.emissive = new _Color.Color(0x000000);
    _this.emissiveIntensity = 1.0;
    _this.emissiveMap = null;
    _this.bumpMap = null;
    _this.bumpScale = 1;
    _this.normalMap = null;
    _this.normalMapType = _constants.TangentSpaceNormalMap;
    _this.normalScale = new _Vector.Vector2(1, 1);
    _this.displacementMap = null;
    _this.displacementScale = 1;
    _this.displacementBias = 0;
    _this.specularMap = null;
    _this.alphaMap = null;
    _this.envMap = null;
    _this.combine = _constants.MultiplyOperation;
    _this.reflectivity = 1;
    _this.refractionRatio = 0.98;
    _this.wireframe = false;
    _this.wireframeLinewidth = 1;
    _this.wireframeLinecap = 'round';
    _this.wireframeLinejoin = 'round';
    _this.flatShading = false;
    _this.setValues(parameters);
    return _this;
  }
  _createClass(MeshPhongMaterial, [{
    key: "copy",
    value: function copy(source) {
      _get(_getPrototypeOf(MeshPhongMaterial.prototype), "copy", this).call(this, source);
      this.color.copy(source.color);
      this.specular.copy(source.specular);
      this.shininess = source.shininess;
      this.map = source.map;
      this.lightMap = source.lightMap;
      this.lightMapIntensity = source.lightMapIntensity;
      this.aoMap = source.aoMap;
      this.aoMapIntensity = source.aoMapIntensity;
      this.emissive.copy(source.emissive);
      this.emissiveMap = source.emissiveMap;
      this.emissiveIntensity = source.emissiveIntensity;
      this.bumpMap = source.bumpMap;
      this.bumpScale = source.bumpScale;
      this.normalMap = source.normalMap;
      this.normalMapType = source.normalMapType;
      this.normalScale.copy(source.normalScale);
      this.displacementMap = source.displacementMap;
      this.displacementScale = source.displacementScale;
      this.displacementBias = source.displacementBias;
      this.specularMap = source.specularMap;
      this.alphaMap = source.alphaMap;
      this.envMap = source.envMap;
      this.combine = source.combine;
      this.reflectivity = source.reflectivity;
      this.refractionRatio = source.refractionRatio;
      this.wireframe = source.wireframe;
      this.wireframeLinewidth = source.wireframeLinewidth;
      this.wireframeLinecap = source.wireframeLinecap;
      this.wireframeLinejoin = source.wireframeLinejoin;
      this.flatShading = source.flatShading;
      return this;
    }
  }]);
  return MeshPhongMaterial;
}(_Material2.Material);
exports.MeshPhongMaterial = MeshPhongMaterial;
MeshPhongMaterial.prototype.isMeshPhongMaterial = true;
},{"../constants.js":68,"../math/Color.js":81,"../math/Vector2.js":89,"./Material.js":78}],80:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Box3 = void 0;
var _Vector = require("./Vector3.js");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Box3 = /*#__PURE__*/function () {
  function Box3() {
    var min = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new _Vector.Vector3(+Infinity, +Infinity, +Infinity);
    var max = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : new _Vector.Vector3(-Infinity, -Infinity, -Infinity);
    _classCallCheck(this, Box3);
    this.min = min;
    this.max = max;
  }
  _createClass(Box3, [{
    key: "set",
    value: function set(min, max) {
      this.min.copy(min);
      this.max.copy(max);
      return this;
    }
  }, {
    key: "setFromArray",
    value: function setFromArray(array) {
      var minX = +Infinity;
      var minY = +Infinity;
      var minZ = +Infinity;
      var maxX = -Infinity;
      var maxY = -Infinity;
      var maxZ = -Infinity;
      for (var i = 0, l = array.length; i < l; i += 3) {
        var x = array[i];
        var y = array[i + 1];
        var z = array[i + 2];
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
      this.min.set(minX, minY, minZ);
      this.max.set(maxX, maxY, maxZ);
      return this;
    }
  }, {
    key: "setFromBufferAttribute",
    value: function setFromBufferAttribute(attribute) {
      var minX = +Infinity;
      var minY = +Infinity;
      var minZ = +Infinity;
      var maxX = -Infinity;
      var maxY = -Infinity;
      var maxZ = -Infinity;
      for (var i = 0, l = attribute.count; i < l; i++) {
        var x = attribute.getX(i);
        var y = attribute.getY(i);
        var z = attribute.getZ(i);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        if (z > maxZ) maxZ = z;
      }
      this.min.set(minX, minY, minZ);
      this.max.set(maxX, maxY, maxZ);
      return this;
    }
  }, {
    key: "setFromPoints",
    value: function setFromPoints(points) {
      this.makeEmpty();
      for (var i = 0, il = points.length; i < il; i++) {
        this.expandByPoint(points[i]);
      }
      return this;
    }
  }, {
    key: "setFromCenterAndSize",
    value: function setFromCenterAndSize(center, size) {
      var halfSize = _vector.copy(size).multiplyScalar(0.5);
      this.min.copy(center).sub(halfSize);
      this.max.copy(center).add(halfSize);
      return this;
    }
  }, {
    key: "setFromObject",
    value: function setFromObject(object) {
      var precise = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      this.makeEmpty();
      return this.expandByObject(object, precise);
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor().copy(this);
    }
  }, {
    key: "copy",
    value: function copy(box) {
      this.min.copy(box.min);
      this.max.copy(box.max);
      return this;
    }
  }, {
    key: "makeEmpty",
    value: function makeEmpty() {
      this.min.x = this.min.y = this.min.z = +Infinity;
      this.max.x = this.max.y = this.max.z = -Infinity;
      return this;
    }
  }, {
    key: "isEmpty",
    value: function isEmpty() {
      // this is a more robust check for empty than ( volume <= 0 ) because volume can get positive with two negative axes

      return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
    }
  }, {
    key: "getCenter",
    value: function getCenter(target) {
      return this.isEmpty() ? target.set(0, 0, 0) : target.addVectors(this.min, this.max).multiplyScalar(0.5);
    }
  }, {
    key: "getSize",
    value: function getSize(target) {
      return this.isEmpty() ? target.set(0, 0, 0) : target.subVectors(this.max, this.min);
    }
  }, {
    key: "expandByPoint",
    value: function expandByPoint(point) {
      this.min.min(point);
      this.max.max(point);
      return this;
    }
  }, {
    key: "expandByVector",
    value: function expandByVector(vector) {
      this.min.sub(vector);
      this.max.add(vector);
      return this;
    }
  }, {
    key: "expandByScalar",
    value: function expandByScalar(scalar) {
      this.min.addScalar(-scalar);
      this.max.addScalar(scalar);
      return this;
    }
  }, {
    key: "expandByObject",
    value: function expandByObject(object) {
      var precise = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
      // Computes the world-axis-aligned bounding box of an object (including its children),
      // accounting for both the object's, and children's, world transforms

      object.updateWorldMatrix(false, false);
      var geometry = object.geometry;
      if (geometry !== undefined) {
        if (precise && geometry.attributes != undefined && geometry.attributes.position !== undefined) {
          var position = geometry.attributes.position;
          for (var i = 0, l = position.count; i < l; i++) {
            _vector.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
            this.expandByPoint(_vector);
          }
        } else {
          if (geometry.boundingBox === null) {
            geometry.computeBoundingBox();
          }
          _box.copy(geometry.boundingBox);
          _box.applyMatrix4(object.matrixWorld);
          this.union(_box);
        }
      }
      var children = object.children;
      for (var _i = 0, _l = children.length; _i < _l; _i++) {
        this.expandByObject(children[_i], precise);
      }
      return this;
    }
  }, {
    key: "containsPoint",
    value: function containsPoint(point) {
      return point.x < this.min.x || point.x > this.max.x || point.y < this.min.y || point.y > this.max.y || point.z < this.min.z || point.z > this.max.z ? false : true;
    }
  }, {
    key: "containsBox",
    value: function containsBox(box) {
      return this.min.x <= box.min.x && box.max.x <= this.max.x && this.min.y <= box.min.y && box.max.y <= this.max.y && this.min.z <= box.min.z && box.max.z <= this.max.z;
    }
  }, {
    key: "getParameter",
    value: function getParameter(point, target) {
      // This can potentially have a divide by zero if the box
      // has a size dimension of 0.

      return target.set((point.x - this.min.x) / (this.max.x - this.min.x), (point.y - this.min.y) / (this.max.y - this.min.y), (point.z - this.min.z) / (this.max.z - this.min.z));
    }
  }, {
    key: "intersectsBox",
    value: function intersectsBox(box) {
      // using 6 splitting planes to rule out intersections.
      return box.max.x < this.min.x || box.min.x > this.max.x || box.max.y < this.min.y || box.min.y > this.max.y || box.max.z < this.min.z || box.min.z > this.max.z ? false : true;
    }
  }, {
    key: "intersectsSphere",
    value: function intersectsSphere(sphere) {
      // Find the point on the AABB closest to the sphere center.
      this.clampPoint(sphere.center, _vector);

      // If that point is inside the sphere, the AABB and sphere intersect.
      return _vector.distanceToSquared(sphere.center) <= sphere.radius * sphere.radius;
    }
  }, {
    key: "intersectsPlane",
    value: function intersectsPlane(plane) {
      // We compute the minimum and maximum dot product values. If those values
      // are on the same side (back or front) of the plane, then there is no intersection.

      var min, max;
      if (plane.normal.x > 0) {
        min = plane.normal.x * this.min.x;
        max = plane.normal.x * this.max.x;
      } else {
        min = plane.normal.x * this.max.x;
        max = plane.normal.x * this.min.x;
      }
      if (plane.normal.y > 0) {
        min += plane.normal.y * this.min.y;
        max += plane.normal.y * this.max.y;
      } else {
        min += plane.normal.y * this.max.y;
        max += plane.normal.y * this.min.y;
      }
      if (plane.normal.z > 0) {
        min += plane.normal.z * this.min.z;
        max += plane.normal.z * this.max.z;
      } else {
        min += plane.normal.z * this.max.z;
        max += plane.normal.z * this.min.z;
      }
      return min <= -plane.constant && max >= -plane.constant;
    }
  }, {
    key: "intersectsTriangle",
    value: function intersectsTriangle(triangle) {
      if (this.isEmpty()) {
        return false;
      }

      // compute box center and extents
      this.getCenter(_center);
      _extents.subVectors(this.max, _center);

      // translate triangle to aabb origin
      _v0.subVectors(triangle.a, _center);
      _v1.subVectors(triangle.b, _center);
      _v2.subVectors(triangle.c, _center);

      // compute edge vectors for triangle
      _f0.subVectors(_v1, _v0);
      _f1.subVectors(_v2, _v1);
      _f2.subVectors(_v0, _v2);

      // test against axes that are given by cross product combinations of the edges of the triangle and the edges of the aabb
      // make an axis testing of each of the 3 sides of the aabb against each of the 3 sides of the triangle = 9 axis of separation
      // axis_ij = u_i x f_j (u0, u1, u2 = face normals of aabb = x,y,z axes vectors since aabb is axis aligned)
      var axes = [0, -_f0.z, _f0.y, 0, -_f1.z, _f1.y, 0, -_f2.z, _f2.y, _f0.z, 0, -_f0.x, _f1.z, 0, -_f1.x, _f2.z, 0, -_f2.x, -_f0.y, _f0.x, 0, -_f1.y, _f1.x, 0, -_f2.y, _f2.x, 0];
      if (!satForAxes(axes, _v0, _v1, _v2, _extents)) {
        return false;
      }

      // test 3 face normals from the aabb
      axes = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (!satForAxes(axes, _v0, _v1, _v2, _extents)) {
        return false;
      }

      // finally testing the face normal of the triangle
      // use already existing triangle edge vectors here
      _triangleNormal.crossVectors(_f0, _f1);
      axes = [_triangleNormal.x, _triangleNormal.y, _triangleNormal.z];
      return satForAxes(axes, _v0, _v1, _v2, _extents);
    }
  }, {
    key: "clampPoint",
    value: function clampPoint(point, target) {
      return target.copy(point).clamp(this.min, this.max);
    }
  }, {
    key: "distanceToPoint",
    value: function distanceToPoint(point) {
      var clampedPoint = _vector.copy(point).clamp(this.min, this.max);
      return clampedPoint.sub(point).length();
    }
  }, {
    key: "getBoundingSphere",
    value: function getBoundingSphere(target) {
      this.getCenter(target.center);
      target.radius = this.getSize(_vector).length() * 0.5;
      return target;
    }
  }, {
    key: "intersect",
    value: function intersect(box) {
      this.min.max(box.min);
      this.max.min(box.max);

      // ensure that if there is no overlap, the result is fully empty, not slightly empty with non-inf/+inf values that will cause subsequence intersects to erroneously return valid values.
      if (this.isEmpty()) this.makeEmpty();
      return this;
    }
  }, {
    key: "union",
    value: function union(box) {
      this.min.min(box.min);
      this.max.max(box.max);
      return this;
    }
  }, {
    key: "applyMatrix4",
    value: function applyMatrix4(matrix) {
      // transform of empty box is an empty box.
      if (this.isEmpty()) return this;

      // NOTE: I am using a binary pattern to specify all 2^3 combinations below
      _points[0].set(this.min.x, this.min.y, this.min.z).applyMatrix4(matrix); // 000
      _points[1].set(this.min.x, this.min.y, this.max.z).applyMatrix4(matrix); // 001
      _points[2].set(this.min.x, this.max.y, this.min.z).applyMatrix4(matrix); // 010
      _points[3].set(this.min.x, this.max.y, this.max.z).applyMatrix4(matrix); // 011
      _points[4].set(this.max.x, this.min.y, this.min.z).applyMatrix4(matrix); // 100
      _points[5].set(this.max.x, this.min.y, this.max.z).applyMatrix4(matrix); // 101
      _points[6].set(this.max.x, this.max.y, this.min.z).applyMatrix4(matrix); // 110
      _points[7].set(this.max.x, this.max.y, this.max.z).applyMatrix4(matrix); // 111

      this.setFromPoints(_points);
      return this;
    }
  }, {
    key: "translate",
    value: function translate(offset) {
      this.min.add(offset);
      this.max.add(offset);
      return this;
    }
  }, {
    key: "equals",
    value: function equals(box) {
      return box.min.equals(this.min) && box.max.equals(this.max);
    }
  }]);
  return Box3;
}();
exports.Box3 = Box3;
Box3.prototype.isBox3 = true;
var _points = [/*@__PURE__*/new _Vector.Vector3(), /*@__PURE__*/new _Vector.Vector3(), /*@__PURE__*/new _Vector.Vector3(), /*@__PURE__*/new _Vector.Vector3(), /*@__PURE__*/new _Vector.Vector3(), /*@__PURE__*/new _Vector.Vector3(), /*@__PURE__*/new _Vector.Vector3(), /*@__PURE__*/new _Vector.Vector3()];
var _vector = /*@__PURE__*/new _Vector.Vector3();
var _box = /*@__PURE__*/new Box3();

// triangle centered vertices

var _v0 = /*@__PURE__*/new _Vector.Vector3();
var _v1 = /*@__PURE__*/new _Vector.Vector3();
var _v2 = /*@__PURE__*/new _Vector.Vector3();

// triangle edge vectors

var _f0 = /*@__PURE__*/new _Vector.Vector3();
var _f1 = /*@__PURE__*/new _Vector.Vector3();
var _f2 = /*@__PURE__*/new _Vector.Vector3();
var _center = /*@__PURE__*/new _Vector.Vector3();
var _extents = /*@__PURE__*/new _Vector.Vector3();
var _triangleNormal = /*@__PURE__*/new _Vector.Vector3();
var _testAxis = /*@__PURE__*/new _Vector.Vector3();
function satForAxes(axes, v0, v1, v2, extents) {
  for (var i = 0, j = axes.length - 3; i <= j; i += 3) {
    _testAxis.fromArray(axes, i);
    // project the aabb onto the separating axis
    var r = extents.x * Math.abs(_testAxis.x) + extents.y * Math.abs(_testAxis.y) + extents.z * Math.abs(_testAxis.z);
    // project all 3 vertices of the triangle onto the separating axis
    var p0 = v0.dot(_testAxis);
    var p1 = v1.dot(_testAxis);
    var p2 = v2.dot(_testAxis);
    // actual test, basically see if either of the most extreme of the triangle points intersects r
    if (Math.max(-Math.max(p0, p1, p2), Math.min(p0, p1, p2)) > r) {
      // points of the projected triangle are outside the projected half-length of the aabb
      // the axis is separating and we can exit
      return false;
    }
  }
  return true;
}
},{"./Vector3.js":90}],81:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Color = void 0;
Object.defineProperty(exports, "SRGBToLinear", {
  enumerable: true,
  get: function get() {
    return _ColorManagement.SRGBToLinear;
  }
});
var _MathUtils = require("./MathUtils.js");
var _ColorManagement = require("./ColorManagement.js");
var _constants = require("../constants.js");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var _colorKeywords = {
  'aliceblue': 0xF0F8FF,
  'antiquewhite': 0xFAEBD7,
  'aqua': 0x00FFFF,
  'aquamarine': 0x7FFFD4,
  'azure': 0xF0FFFF,
  'beige': 0xF5F5DC,
  'bisque': 0xFFE4C4,
  'black': 0x000000,
  'blanchedalmond': 0xFFEBCD,
  'blue': 0x0000FF,
  'blueviolet': 0x8A2BE2,
  'brown': 0xA52A2A,
  'burlywood': 0xDEB887,
  'cadetblue': 0x5F9EA0,
  'chartreuse': 0x7FFF00,
  'chocolate': 0xD2691E,
  'coral': 0xFF7F50,
  'cornflowerblue': 0x6495ED,
  'cornsilk': 0xFFF8DC,
  'crimson': 0xDC143C,
  'cyan': 0x00FFFF,
  'darkblue': 0x00008B,
  'darkcyan': 0x008B8B,
  'darkgoldenrod': 0xB8860B,
  'darkgray': 0xA9A9A9,
  'darkgreen': 0x006400,
  'darkgrey': 0xA9A9A9,
  'darkkhaki': 0xBDB76B,
  'darkmagenta': 0x8B008B,
  'darkolivegreen': 0x556B2F,
  'darkorange': 0xFF8C00,
  'darkorchid': 0x9932CC,
  'darkred': 0x8B0000,
  'darksalmon': 0xE9967A,
  'darkseagreen': 0x8FBC8F,
  'darkslateblue': 0x483D8B,
  'darkslategray': 0x2F4F4F,
  'darkslategrey': 0x2F4F4F,
  'darkturquoise': 0x00CED1,
  'darkviolet': 0x9400D3,
  'deeppink': 0xFF1493,
  'deepskyblue': 0x00BFFF,
  'dimgray': 0x696969,
  'dimgrey': 0x696969,
  'dodgerblue': 0x1E90FF,
  'firebrick': 0xB22222,
  'floralwhite': 0xFFFAF0,
  'forestgreen': 0x228B22,
  'fuchsia': 0xFF00FF,
  'gainsboro': 0xDCDCDC,
  'ghostwhite': 0xF8F8FF,
  'gold': 0xFFD700,
  'goldenrod': 0xDAA520,
  'gray': 0x808080,
  'green': 0x008000,
  'greenyellow': 0xADFF2F,
  'grey': 0x808080,
  'honeydew': 0xF0FFF0,
  'hotpink': 0xFF69B4,
  'indianred': 0xCD5C5C,
  'indigo': 0x4B0082,
  'ivory': 0xFFFFF0,
  'khaki': 0xF0E68C,
  'lavender': 0xE6E6FA,
  'lavenderblush': 0xFFF0F5,
  'lawngreen': 0x7CFC00,
  'lemonchiffon': 0xFFFACD,
  'lightblue': 0xADD8E6,
  'lightcoral': 0xF08080,
  'lightcyan': 0xE0FFFF,
  'lightgoldenrodyellow': 0xFAFAD2,
  'lightgray': 0xD3D3D3,
  'lightgreen': 0x90EE90,
  'lightgrey': 0xD3D3D3,
  'lightpink': 0xFFB6C1,
  'lightsalmon': 0xFFA07A,
  'lightseagreen': 0x20B2AA,
  'lightskyblue': 0x87CEFA,
  'lightslategray': 0x778899,
  'lightslategrey': 0x778899,
  'lightsteelblue': 0xB0C4DE,
  'lightyellow': 0xFFFFE0,
  'lime': 0x00FF00,
  'limegreen': 0x32CD32,
  'linen': 0xFAF0E6,
  'magenta': 0xFF00FF,
  'maroon': 0x800000,
  'mediumaquamarine': 0x66CDAA,
  'mediumblue': 0x0000CD,
  'mediumorchid': 0xBA55D3,
  'mediumpurple': 0x9370DB,
  'mediumseagreen': 0x3CB371,
  'mediumslateblue': 0x7B68EE,
  'mediumspringgreen': 0x00FA9A,
  'mediumturquoise': 0x48D1CC,
  'mediumvioletred': 0xC71585,
  'midnightblue': 0x191970,
  'mintcream': 0xF5FFFA,
  'mistyrose': 0xFFE4E1,
  'moccasin': 0xFFE4B5,
  'navajowhite': 0xFFDEAD,
  'navy': 0x000080,
  'oldlace': 0xFDF5E6,
  'olive': 0x808000,
  'olivedrab': 0x6B8E23,
  'orange': 0xFFA500,
  'orangered': 0xFF4500,
  'orchid': 0xDA70D6,
  'palegoldenrod': 0xEEE8AA,
  'palegreen': 0x98FB98,
  'paleturquoise': 0xAFEEEE,
  'palevioletred': 0xDB7093,
  'papayawhip': 0xFFEFD5,
  'peachpuff': 0xFFDAB9,
  'peru': 0xCD853F,
  'pink': 0xFFC0CB,
  'plum': 0xDDA0DD,
  'powderblue': 0xB0E0E6,
  'purple': 0x800080,
  'rebeccapurple': 0x663399,
  'red': 0xFF0000,
  'rosybrown': 0xBC8F8F,
  'royalblue': 0x4169E1,
  'saddlebrown': 0x8B4513,
  'salmon': 0xFA8072,
  'sandybrown': 0xF4A460,
  'seagreen': 0x2E8B57,
  'seashell': 0xFFF5EE,
  'sienna': 0xA0522D,
  'silver': 0xC0C0C0,
  'skyblue': 0x87CEEB,
  'slateblue': 0x6A5ACD,
  'slategray': 0x708090,
  'slategrey': 0x708090,
  'snow': 0xFFFAFA,
  'springgreen': 0x00FF7F,
  'steelblue': 0x4682B4,
  'tan': 0xD2B48C,
  'teal': 0x008080,
  'thistle': 0xD8BFD8,
  'tomato': 0xFF6347,
  'turquoise': 0x40E0D0,
  'violet': 0xEE82EE,
  'wheat': 0xF5DEB3,
  'white': 0xFFFFFF,
  'whitesmoke': 0xF5F5F5,
  'yellow': 0xFFFF00,
  'yellowgreen': 0x9ACD32
};
var _rgb = {
  r: 0,
  g: 0,
  b: 0
};
var _hslA = {
  h: 0,
  s: 0,
  l: 0
};
var _hslB = {
  h: 0,
  s: 0,
  l: 0
};
function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
  return p;
}
function toComponents(source, target) {
  target.r = source.r;
  target.g = source.g;
  target.b = source.b;
  return target;
}
var Color = /*#__PURE__*/function () {
  function Color(r, g, b) {
    _classCallCheck(this, Color);
    if (g === undefined && b === undefined) {
      // r is THREE.Color, hex or string
      return this.set(r);
    }
    return this.setRGB(r, g, b);
  }
  _createClass(Color, [{
    key: "set",
    value: function set(value) {
      if (value && value.isColor) {
        this.copy(value);
      } else if (typeof value === 'number') {
        this.setHex(value);
      } else if (typeof value === 'string') {
        this.setStyle(value);
      }
      return this;
    }
  }, {
    key: "setScalar",
    value: function setScalar(scalar) {
      this.r = scalar;
      this.g = scalar;
      this.b = scalar;
      return this;
    }
  }, {
    key: "setHex",
    value: function setHex(hex) {
      var colorSpace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _constants.SRGBColorSpace;
      hex = Math.floor(hex);
      this.r = (hex >> 16 & 255) / 255;
      this.g = (hex >> 8 & 255) / 255;
      this.b = (hex & 255) / 255;
      _ColorManagement.ColorManagement.toWorkingColorSpace(this, colorSpace);
      return this;
    }
  }, {
    key: "setRGB",
    value: function setRGB(r, g, b) {
      var colorSpace = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : _constants.LinearSRGBColorSpace;
      this.r = r;
      this.g = g;
      this.b = b;
      _ColorManagement.ColorManagement.toWorkingColorSpace(this, colorSpace);
      return this;
    }
  }, {
    key: "setHSL",
    value: function setHSL(h, s, l) {
      var colorSpace = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : _constants.LinearSRGBColorSpace;
      // h,s,l ranges are in 0.0 - 1.0
      h = (0, _MathUtils.euclideanModulo)(h, 1);
      s = (0, _MathUtils.clamp)(s, 0, 1);
      l = (0, _MathUtils.clamp)(l, 0, 1);
      if (s === 0) {
        this.r = this.g = this.b = l;
      } else {
        var p = l <= 0.5 ? l * (1 + s) : l + s - l * s;
        var q = 2 * l - p;
        this.r = hue2rgb(q, p, h + 1 / 3);
        this.g = hue2rgb(q, p, h);
        this.b = hue2rgb(q, p, h - 1 / 3);
      }
      _ColorManagement.ColorManagement.toWorkingColorSpace(this, colorSpace);
      return this;
    }
  }, {
    key: "setStyle",
    value: function setStyle(style) {
      var colorSpace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _constants.SRGBColorSpace;
      function handleAlpha(string) {
        if (string === undefined) return;
        if (parseFloat(string) < 1) {
          console.warn('THREE.Color: Alpha component of ' + style + ' will be ignored.');
        }
      }
      var m;
      if (m = /^((?:rgb|hsl)a?)\(([^\)]*)\)/.exec(style)) {
        // rgb / hsl

        var color;
        var name = m[1];
        var components = m[2];
        switch (name) {
          case 'rgb':
          case 'rgba':
            if (color = /^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
              // rgb(255,0,0) rgba(255,0,0,0.5)
              this.r = Math.min(255, parseInt(color[1], 10)) / 255;
              this.g = Math.min(255, parseInt(color[2], 10)) / 255;
              this.b = Math.min(255, parseInt(color[3], 10)) / 255;
              _ColorManagement.ColorManagement.toWorkingColorSpace(this, colorSpace);
              handleAlpha(color[4]);
              return this;
            }
            if (color = /^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
              // rgb(100%,0%,0%) rgba(100%,0%,0%,0.5)
              this.r = Math.min(100, parseInt(color[1], 10)) / 100;
              this.g = Math.min(100, parseInt(color[2], 10)) / 100;
              this.b = Math.min(100, parseInt(color[3], 10)) / 100;
              _ColorManagement.ColorManagement.toWorkingColorSpace(this, colorSpace);
              handleAlpha(color[4]);
              return this;
            }
            break;
          case 'hsl':
          case 'hsla':
            if (color = /^\s*(\d*\.?\d+)\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(components)) {
              // hsl(120,50%,50%) hsla(120,50%,50%,0.5)
              var h = parseFloat(color[1]) / 360;
              var s = parseInt(color[2], 10) / 100;
              var l = parseInt(color[3], 10) / 100;
              handleAlpha(color[4]);
              return this.setHSL(h, s, l, colorSpace);
            }
            break;
        }
      } else if (m = /^\#([A-Fa-f\d]+)$/.exec(style)) {
        // hex color

        var hex = m[1];
        var size = hex.length;
        if (size === 3) {
          // #ff0
          this.r = parseInt(hex.charAt(0) + hex.charAt(0), 16) / 255;
          this.g = parseInt(hex.charAt(1) + hex.charAt(1), 16) / 255;
          this.b = parseInt(hex.charAt(2) + hex.charAt(2), 16) / 255;
          _ColorManagement.ColorManagement.toWorkingColorSpace(this, colorSpace);
          return this;
        } else if (size === 6) {
          // #ff0000
          this.r = parseInt(hex.charAt(0) + hex.charAt(1), 16) / 255;
          this.g = parseInt(hex.charAt(2) + hex.charAt(3), 16) / 255;
          this.b = parseInt(hex.charAt(4) + hex.charAt(5), 16) / 255;
          _ColorManagement.ColorManagement.toWorkingColorSpace(this, colorSpace);
          return this;
        }
      }
      if (style && style.length > 0) {
        return this.setColorName(style, colorSpace);
      }
      return this;
    }
  }, {
    key: "setColorName",
    value: function setColorName(style) {
      var colorSpace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _constants.SRGBColorSpace;
      // color keywords
      var hex = _colorKeywords[style.toLowerCase()];
      if (hex !== undefined) {
        // red
        this.setHex(hex, colorSpace);
      } else {
        // unknown color
        console.warn('THREE.Color: Unknown color ' + style);
      }
      return this;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor(this.r, this.g, this.b);
    }
  }, {
    key: "copy",
    value: function copy(color) {
      this.r = color.r;
      this.g = color.g;
      this.b = color.b;
      return this;
    }
  }, {
    key: "copySRGBToLinear",
    value: function copySRGBToLinear(color) {
      this.r = (0, _ColorManagement.SRGBToLinear)(color.r);
      this.g = (0, _ColorManagement.SRGBToLinear)(color.g);
      this.b = (0, _ColorManagement.SRGBToLinear)(color.b);
      return this;
    }
  }, {
    key: "copyLinearToSRGB",
    value: function copyLinearToSRGB(color) {
      this.r = (0, _ColorManagement.LinearToSRGB)(color.r);
      this.g = (0, _ColorManagement.LinearToSRGB)(color.g);
      this.b = (0, _ColorManagement.LinearToSRGB)(color.b);
      return this;
    }
  }, {
    key: "convertSRGBToLinear",
    value: function convertSRGBToLinear() {
      this.copySRGBToLinear(this);
      return this;
    }
  }, {
    key: "convertLinearToSRGB",
    value: function convertLinearToSRGB() {
      this.copyLinearToSRGB(this);
      return this;
    }
  }, {
    key: "getHex",
    value: function getHex() {
      var colorSpace = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _constants.SRGBColorSpace;
      _ColorManagement.ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);
      return (0, _MathUtils.clamp)(_rgb.r * 255, 0, 255) << 16 ^ (0, _MathUtils.clamp)(_rgb.g * 255, 0, 255) << 8 ^ (0, _MathUtils.clamp)(_rgb.b * 255, 0, 255) << 0;
    }
  }, {
    key: "getHexString",
    value: function getHexString() {
      var colorSpace = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _constants.SRGBColorSpace;
      return ('000000' + this.getHex(colorSpace).toString(16)).slice(-6);
    }
  }, {
    key: "getHSL",
    value: function getHSL(target) {
      var colorSpace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _constants.LinearSRGBColorSpace;
      // h,s,l ranges are in 0.0 - 1.0

      _ColorManagement.ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);
      var r = _rgb.r,
        g = _rgb.g,
        b = _rgb.b;
      var max = Math.max(r, g, b);
      var min = Math.min(r, g, b);
      var hue, saturation;
      var lightness = (min + max) / 2.0;
      if (min === max) {
        hue = 0;
        saturation = 0;
      } else {
        var delta = max - min;
        saturation = lightness <= 0.5 ? delta / (max + min) : delta / (2 - max - min);
        switch (max) {
          case r:
            hue = (g - b) / delta + (g < b ? 6 : 0);
            break;
          case g:
            hue = (b - r) / delta + 2;
            break;
          case b:
            hue = (r - g) / delta + 4;
            break;
        }
        hue /= 6;
      }
      target.h = hue;
      target.s = saturation;
      target.l = lightness;
      return target;
    }
  }, {
    key: "getRGB",
    value: function getRGB(target) {
      var colorSpace = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : _constants.LinearSRGBColorSpace;
      _ColorManagement.ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);
      target.r = _rgb.r;
      target.g = _rgb.g;
      target.b = _rgb.b;
      return target;
    }
  }, {
    key: "getStyle",
    value: function getStyle() {
      var colorSpace = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : _constants.SRGBColorSpace;
      _ColorManagement.ColorManagement.fromWorkingColorSpace(toComponents(this, _rgb), colorSpace);
      if (colorSpace !== _constants.SRGBColorSpace) {
        // Requires CSS Color Module Level 4 (https://www.w3.org/TR/css-color-4/).
        return "color(".concat(colorSpace, " ").concat(_rgb.r, " ").concat(_rgb.g, " ").concat(_rgb.b, ")");
      }
      return "rgb(".concat(_rgb.r * 255 | 0, ",").concat(_rgb.g * 255 | 0, ",").concat(_rgb.b * 255 | 0, ")");
    }
  }, {
    key: "offsetHSL",
    value: function offsetHSL(h, s, l) {
      this.getHSL(_hslA);
      _hslA.h += h;
      _hslA.s += s;
      _hslA.l += l;
      this.setHSL(_hslA.h, _hslA.s, _hslA.l);
      return this;
    }
  }, {
    key: "add",
    value: function add(color) {
      this.r += color.r;
      this.g += color.g;
      this.b += color.b;
      return this;
    }
  }, {
    key: "addColors",
    value: function addColors(color1, color2) {
      this.r = color1.r + color2.r;
      this.g = color1.g + color2.g;
      this.b = color1.b + color2.b;
      return this;
    }
  }, {
    key: "addScalar",
    value: function addScalar(s) {
      this.r += s;
      this.g += s;
      this.b += s;
      return this;
    }
  }, {
    key: "sub",
    value: function sub(color) {
      this.r = Math.max(0, this.r - color.r);
      this.g = Math.max(0, this.g - color.g);
      this.b = Math.max(0, this.b - color.b);
      return this;
    }
  }, {
    key: "multiply",
    value: function multiply(color) {
      this.r *= color.r;
      this.g *= color.g;
      this.b *= color.b;
      return this;
    }
  }, {
    key: "multiplyScalar",
    value: function multiplyScalar(s) {
      this.r *= s;
      this.g *= s;
      this.b *= s;
      return this;
    }
  }, {
    key: "lerp",
    value: function lerp(color, alpha) {
      this.r += (color.r - this.r) * alpha;
      this.g += (color.g - this.g) * alpha;
      this.b += (color.b - this.b) * alpha;
      return this;
    }
  }, {
    key: "lerpColors",
    value: function lerpColors(color1, color2, alpha) {
      this.r = color1.r + (color2.r - color1.r) * alpha;
      this.g = color1.g + (color2.g - color1.g) * alpha;
      this.b = color1.b + (color2.b - color1.b) * alpha;
      return this;
    }
  }, {
    key: "lerpHSL",
    value: function lerpHSL(color, alpha) {
      this.getHSL(_hslA);
      color.getHSL(_hslB);
      var h = (0, _MathUtils.lerp)(_hslA.h, _hslB.h, alpha);
      var s = (0, _MathUtils.lerp)(_hslA.s, _hslB.s, alpha);
      var l = (0, _MathUtils.lerp)(_hslA.l, _hslB.l, alpha);
      this.setHSL(h, s, l);
      return this;
    }
  }, {
    key: "equals",
    value: function equals(c) {
      return c.r === this.r && c.g === this.g && c.b === this.b;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this.r = array[offset];
      this.g = array[offset + 1];
      this.b = array[offset + 2];
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      array[offset] = this.r;
      array[offset + 1] = this.g;
      array[offset + 2] = this.b;
      return array;
    }
  }, {
    key: "fromBufferAttribute",
    value: function fromBufferAttribute(attribute, index) {
      this.r = attribute.getX(index);
      this.g = attribute.getY(index);
      this.b = attribute.getZ(index);
      if (attribute.normalized === true) {
        // assuming Uint8Array

        this.r /= 255;
        this.g /= 255;
        this.b /= 255;
      }
      return this;
    }
  }, {
    key: "toJSON",
    value: function toJSON() {
      return this.getHex();
    }
  }]);
  return Color;
}();
exports.Color = Color;
Color.NAMES = _colorKeywords;
Color.prototype.isColor = true;
Color.prototype.r = 1;
Color.prototype.g = 1;
Color.prototype.b = 1;
},{"../constants.js":68,"./ColorManagement.js":82,"./MathUtils.js":84}],82:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ColorManagement = void 0;
exports.LinearToSRGB = LinearToSRGB;
exports.SRGBToLinear = SRGBToLinear;
var _constants = require("../constants.js");
var _FN;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function SRGBToLinear(c) {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}
function LinearToSRGB(c) {
  return c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055;
}

// JavaScript RGB-to-RGB transforms, defined as
// FN[InputColorSpace][OutputColorSpace] callback functions.
var FN = (_FN = {}, _defineProperty(_FN, _constants.SRGBColorSpace, _defineProperty({}, _constants.LinearSRGBColorSpace, SRGBToLinear)), _defineProperty(_FN, _constants.LinearSRGBColorSpace, _defineProperty({}, _constants.SRGBColorSpace, LinearToSRGB)), _FN);
var ColorManagement = {
  legacyMode: true,
  get workingColorSpace() {
    return _constants.LinearSRGBColorSpace;
  },
  set workingColorSpace(colorSpace) {
    console.warn('THREE.ColorManagement: .workingColorSpace is readonly.');
  },
  convert: function convert(color, sourceColorSpace, targetColorSpace) {
    if (this.legacyMode || sourceColorSpace === targetColorSpace || !sourceColorSpace || !targetColorSpace) {
      return color;
    }
    if (FN[sourceColorSpace] && FN[sourceColorSpace][targetColorSpace] !== undefined) {
      var fn = FN[sourceColorSpace][targetColorSpace];
      color.r = fn(color.r);
      color.g = fn(color.g);
      color.b = fn(color.b);
      return color;
    }
    throw new Error('Unsupported color space conversion.');
  },
  fromWorkingColorSpace: function fromWorkingColorSpace(color, targetColorSpace) {
    return this.convert(color, this.workingColorSpace, targetColorSpace);
  },
  toWorkingColorSpace: function toWorkingColorSpace(color, sourceColorSpace) {
    return this.convert(color, sourceColorSpace, this.workingColorSpace);
  }
};
exports.ColorManagement = ColorManagement;
},{"../constants.js":68}],83:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Euler = void 0;
var _Quaternion = require("./Quaternion.js");
var _Matrix = require("./Matrix4.js");
var _MathUtils = require("./MathUtils.js");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var _matrix = /*@__PURE__*/new _Matrix.Matrix4();
var _quaternion = /*@__PURE__*/new _Quaternion.Quaternion();
var Euler = /*#__PURE__*/function () {
  function Euler() {
    var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var order = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : Euler.DefaultOrder;
    _classCallCheck(this, Euler);
    this._x = x;
    this._y = y;
    this._z = z;
    this._order = order;
  }
  _createClass(Euler, [{
    key: "x",
    get: function get() {
      return this._x;
    },
    set: function set(value) {
      this._x = value;
      this._onChangeCallback();
    }
  }, {
    key: "y",
    get: function get() {
      return this._y;
    },
    set: function set(value) {
      this._y = value;
      this._onChangeCallback();
    }
  }, {
    key: "z",
    get: function get() {
      return this._z;
    },
    set: function set(value) {
      this._z = value;
      this._onChangeCallback();
    }
  }, {
    key: "order",
    get: function get() {
      return this._order;
    },
    set: function set(value) {
      this._order = value;
      this._onChangeCallback();
    }
  }, {
    key: "set",
    value: function set(x, y, z) {
      var order = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : this._order;
      this._x = x;
      this._y = y;
      this._z = z;
      this._order = order;
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor(this._x, this._y, this._z, this._order);
    }
  }, {
    key: "copy",
    value: function copy(euler) {
      this._x = euler._x;
      this._y = euler._y;
      this._z = euler._z;
      this._order = euler._order;
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "setFromRotationMatrix",
    value: function setFromRotationMatrix(m) {
      var order = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._order;
      var update = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
      // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

      var te = m.elements;
      var m11 = te[0],
        m12 = te[4],
        m13 = te[8];
      var m21 = te[1],
        m22 = te[5],
        m23 = te[9];
      var m31 = te[2],
        m32 = te[6],
        m33 = te[10];
      switch (order) {
        case 'XYZ':
          this._y = Math.asin((0, _MathUtils.clamp)(m13, -1, 1));
          if (Math.abs(m13) < 0.9999999) {
            this._x = Math.atan2(-m23, m33);
            this._z = Math.atan2(-m12, m11);
          } else {
            this._x = Math.atan2(m32, m22);
            this._z = 0;
          }
          break;
        case 'YXZ':
          this._x = Math.asin(-(0, _MathUtils.clamp)(m23, -1, 1));
          if (Math.abs(m23) < 0.9999999) {
            this._y = Math.atan2(m13, m33);
            this._z = Math.atan2(m21, m22);
          } else {
            this._y = Math.atan2(-m31, m11);
            this._z = 0;
          }
          break;
        case 'ZXY':
          this._x = Math.asin((0, _MathUtils.clamp)(m32, -1, 1));
          if (Math.abs(m32) < 0.9999999) {
            this._y = Math.atan2(-m31, m33);
            this._z = Math.atan2(-m12, m22);
          } else {
            this._y = 0;
            this._z = Math.atan2(m21, m11);
          }
          break;
        case 'ZYX':
          this._y = Math.asin(-(0, _MathUtils.clamp)(m31, -1, 1));
          if (Math.abs(m31) < 0.9999999) {
            this._x = Math.atan2(m32, m33);
            this._z = Math.atan2(m21, m11);
          } else {
            this._x = 0;
            this._z = Math.atan2(-m12, m22);
          }
          break;
        case 'YZX':
          this._z = Math.asin((0, _MathUtils.clamp)(m21, -1, 1));
          if (Math.abs(m21) < 0.9999999) {
            this._x = Math.atan2(-m23, m22);
            this._y = Math.atan2(-m31, m11);
          } else {
            this._x = 0;
            this._y = Math.atan2(m13, m33);
          }
          break;
        case 'XZY':
          this._z = Math.asin(-(0, _MathUtils.clamp)(m12, -1, 1));
          if (Math.abs(m12) < 0.9999999) {
            this._x = Math.atan2(m32, m22);
            this._y = Math.atan2(m13, m11);
          } else {
            this._x = Math.atan2(-m23, m33);
            this._y = 0;
          }
          break;
        default:
          console.warn('THREE.Euler: .setFromRotationMatrix() encountered an unknown order: ' + order);
      }
      this._order = order;
      if (update === true) this._onChangeCallback();
      return this;
    }
  }, {
    key: "setFromQuaternion",
    value: function setFromQuaternion(q, order, update) {
      _matrix.makeRotationFromQuaternion(q);
      return this.setFromRotationMatrix(_matrix, order, update);
    }
  }, {
    key: "setFromVector3",
    value: function setFromVector3(v) {
      var order = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._order;
      return this.set(v.x, v.y, v.z, order);
    }
  }, {
    key: "reorder",
    value: function reorder(newOrder) {
      // WARNING: this discards revolution information -bhouston

      _quaternion.setFromEuler(this);
      return this.setFromQuaternion(_quaternion, newOrder);
    }
  }, {
    key: "equals",
    value: function equals(euler) {
      return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      this._x = array[0];
      this._y = array[1];
      this._z = array[2];
      if (array[3] !== undefined) this._order = array[3];
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      array[offset] = this._x;
      array[offset + 1] = this._y;
      array[offset + 2] = this._z;
      array[offset + 3] = this._order;
      return array;
    }
  }, {
    key: "_onChange",
    value: function _onChange(callback) {
      this._onChangeCallback = callback;
      return this;
    }
  }, {
    key: "_onChangeCallback",
    value: function _onChangeCallback() {}
  }]);
  return Euler;
}();
exports.Euler = Euler;
Euler.prototype.isEuler = true;
Euler.DefaultOrder = 'XYZ';
Euler.RotationOrders = ['XYZ', 'YZX', 'ZXY', 'XZY', 'YXZ', 'ZYX'];
},{"./MathUtils.js":84,"./Matrix4.js":86,"./Quaternion.js":87}],84:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RAD2DEG = exports.DEG2RAD = void 0;
exports.ceilPowerOfTwo = ceilPowerOfTwo;
exports.clamp = clamp;
exports.damp = damp;
exports.degToRad = degToRad;
exports.denormalize = denormalize;
exports.euclideanModulo = euclideanModulo;
exports.floorPowerOfTwo = floorPowerOfTwo;
exports.generateUUID = generateUUID;
exports.inverseLerp = inverseLerp;
exports.isPowerOfTwo = isPowerOfTwo;
exports.lerp = lerp;
exports.mapLinear = mapLinear;
exports.normalize = normalize;
exports.pingpong = pingpong;
exports.radToDeg = radToDeg;
exports.randFloat = randFloat;
exports.randFloatSpread = randFloatSpread;
exports.randInt = randInt;
exports.seededRandom = seededRandom;
exports.setQuaternionFromProperEuler = setQuaternionFromProperEuler;
exports.smootherstep = smootherstep;
exports.smoothstep = smoothstep;
var _lut = [];
for (var i = 0; i < 256; i++) {
  _lut[i] = (i < 16 ? '0' : '') + i.toString(16);
}
var _seed = 1234567;
var DEG2RAD = Math.PI / 180;
exports.DEG2RAD = DEG2RAD;
var RAD2DEG = 180 / Math.PI;

// http://stackoverflow.com/questions/105034/how-to-create-a-guid-uuid-in-javascript/21963136#21963136
exports.RAD2DEG = RAD2DEG;
function generateUUID() {
  var d0 = Math.random() * 0xffffffff | 0;
  var d1 = Math.random() * 0xffffffff | 0;
  var d2 = Math.random() * 0xffffffff | 0;
  var d3 = Math.random() * 0xffffffff | 0;
  var uuid = _lut[d0 & 0xff] + _lut[d0 >> 8 & 0xff] + _lut[d0 >> 16 & 0xff] + _lut[d0 >> 24 & 0xff] + '-' + _lut[d1 & 0xff] + _lut[d1 >> 8 & 0xff] + '-' + _lut[d1 >> 16 & 0x0f | 0x40] + _lut[d1 >> 24 & 0xff] + '-' + _lut[d2 & 0x3f | 0x80] + _lut[d2 >> 8 & 0xff] + '-' + _lut[d2 >> 16 & 0xff] + _lut[d2 >> 24 & 0xff] + _lut[d3 & 0xff] + _lut[d3 >> 8 & 0xff] + _lut[d3 >> 16 & 0xff] + _lut[d3 >> 24 & 0xff];

  // .toLowerCase() here flattens concatenated strings to save heap memory space.
  return uuid.toLowerCase();
}
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// compute euclidean modulo of m % n
// https://en.wikipedia.org/wiki/Modulo_operation
function euclideanModulo(n, m) {
  return (n % m + m) % m;
}

// Linear mapping from range <a1, a2> to range <b1, b2>
function mapLinear(x, a1, a2, b1, b2) {
  return b1 + (x - a1) * (b2 - b1) / (a2 - a1);
}

// https://www.gamedev.net/tutorials/programming/general-and-gameplay-programming/inverse-lerp-a-super-useful-yet-often-overlooked-function-r5230/
function inverseLerp(x, y, value) {
  if (x !== y) {
    return (value - x) / (y - x);
  } else {
    return 0;
  }
}

// https://en.wikipedia.org/wiki/Linear_interpolation
function lerp(x, y, t) {
  return (1 - t) * x + t * y;
}

// http://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
function damp(x, y, lambda, dt) {
  return lerp(x, y, 1 - Math.exp(-lambda * dt));
}

// https://www.desmos.com/calculator/vcsjnyz7x4
function pingpong(x) {
  var length = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
  return length - Math.abs(euclideanModulo(x, length * 2) - length);
}

// http://en.wikipedia.org/wiki/Smoothstep
function smoothstep(x, min, max) {
  if (x <= min) return 0;
  if (x >= max) return 1;
  x = (x - min) / (max - min);
  return x * x * (3 - 2 * x);
}
function smootherstep(x, min, max) {
  if (x <= min) return 0;
  if (x >= max) return 1;
  x = (x - min) / (max - min);
  return x * x * x * (x * (x * 6 - 15) + 10);
}

// Random integer from <low, high> interval
function randInt(low, high) {
  return low + Math.floor(Math.random() * (high - low + 1));
}

// Random float from <low, high> interval
function randFloat(low, high) {
  return low + Math.random() * (high - low);
}

// Random float from <-range/2, range/2> interval
function randFloatSpread(range) {
  return range * (0.5 - Math.random());
}

// Deterministic pseudo-random float in the interval [ 0, 1 ]
function seededRandom(s) {
  if (s !== undefined) _seed = s;

  // Mulberry32 generator

  var t = _seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}
function degToRad(degrees) {
  return degrees * DEG2RAD;
}
function radToDeg(radians) {
  return radians * RAD2DEG;
}
function isPowerOfTwo(value) {
  return (value & value - 1) === 0 && value !== 0;
}
function ceilPowerOfTwo(value) {
  return Math.pow(2, Math.ceil(Math.log(value) / Math.LN2));
}
function floorPowerOfTwo(value) {
  return Math.pow(2, Math.floor(Math.log(value) / Math.LN2));
}
function setQuaternionFromProperEuler(q, a, b, c, order) {
  // Intrinsic Proper Euler Angles - see https://en.wikipedia.org/wiki/Euler_angles

  // rotations are applied to the axes in the order specified by 'order'
  // rotation by angle 'a' is applied first, then by angle 'b', then by angle 'c'
  // angles are in radians

  var cos = Math.cos;
  var sin = Math.sin;
  var c2 = cos(b / 2);
  var s2 = sin(b / 2);
  var c13 = cos((a + c) / 2);
  var s13 = sin((a + c) / 2);
  var c1_3 = cos((a - c) / 2);
  var s1_3 = sin((a - c) / 2);
  var c3_1 = cos((c - a) / 2);
  var s3_1 = sin((c - a) / 2);
  switch (order) {
    case 'XYX':
      q.set(c2 * s13, s2 * c1_3, s2 * s1_3, c2 * c13);
      break;
    case 'YZY':
      q.set(s2 * s1_3, c2 * s13, s2 * c1_3, c2 * c13);
      break;
    case 'ZXZ':
      q.set(s2 * c1_3, s2 * s1_3, c2 * s13, c2 * c13);
      break;
    case 'XZX':
      q.set(c2 * s13, s2 * s3_1, s2 * c3_1, c2 * c13);
      break;
    case 'YXY':
      q.set(s2 * c3_1, c2 * s13, s2 * s3_1, c2 * c13);
      break;
    case 'ZYZ':
      q.set(s2 * s3_1, s2 * c3_1, c2 * s13, c2 * c13);
      break;
    default:
      console.warn('THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: ' + order);
  }
}
function denormalize(value, array) {
  switch (array.constructor) {
    case Float32Array:
      return value;
    case Uint16Array:
      return value / 65535.0;
    case Uint8Array:
      return value / 255.0;
    case Int16Array:
      return Math.max(value / 32767.0, -1.0);
    case Int8Array:
      return Math.max(value / 127.0, -1.0);
    default:
      throw new Error('Invalid component type.');
  }
}
function normalize(value, array) {
  switch (array.constructor) {
    case Float32Array:
      return value;
    case Uint16Array:
      return Math.round(value * 65535.0);
    case Uint8Array:
      return Math.round(value * 255.0);
    case Int16Array:
      return Math.round(value * 32767.0);
    case Int8Array:
      return Math.round(value * 127.0);
    default:
      throw new Error('Invalid component type.');
  }
}
},{}],85:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Matrix3 = void 0;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Matrix3 = /*#__PURE__*/function () {
  function Matrix3() {
    _classCallCheck(this, Matrix3);
    this.elements = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (arguments.length > 0) {
      console.error('THREE.Matrix3: the constructor no longer reads arguments. use .set() instead.');
    }
  }
  _createClass(Matrix3, [{
    key: "set",
    value: function set(n11, n12, n13, n21, n22, n23, n31, n32, n33) {
      var te = this.elements;
      te[0] = n11;
      te[1] = n21;
      te[2] = n31;
      te[3] = n12;
      te[4] = n22;
      te[5] = n32;
      te[6] = n13;
      te[7] = n23;
      te[8] = n33;
      return this;
    }
  }, {
    key: "identity",
    value: function identity() {
      this.set(1, 0, 0, 0, 1, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "copy",
    value: function copy(m) {
      var te = this.elements;
      var me = m.elements;
      te[0] = me[0];
      te[1] = me[1];
      te[2] = me[2];
      te[3] = me[3];
      te[4] = me[4];
      te[5] = me[5];
      te[6] = me[6];
      te[7] = me[7];
      te[8] = me[8];
      return this;
    }
  }, {
    key: "extractBasis",
    value: function extractBasis(xAxis, yAxis, zAxis) {
      xAxis.setFromMatrix3Column(this, 0);
      yAxis.setFromMatrix3Column(this, 1);
      zAxis.setFromMatrix3Column(this, 2);
      return this;
    }
  }, {
    key: "setFromMatrix4",
    value: function setFromMatrix4(m) {
      var me = m.elements;
      this.set(me[0], me[4], me[8], me[1], me[5], me[9], me[2], me[6], me[10]);
      return this;
    }
  }, {
    key: "multiply",
    value: function multiply(m) {
      return this.multiplyMatrices(this, m);
    }
  }, {
    key: "premultiply",
    value: function premultiply(m) {
      return this.multiplyMatrices(m, this);
    }
  }, {
    key: "multiplyMatrices",
    value: function multiplyMatrices(a, b) {
      var ae = a.elements;
      var be = b.elements;
      var te = this.elements;
      var a11 = ae[0],
        a12 = ae[3],
        a13 = ae[6];
      var a21 = ae[1],
        a22 = ae[4],
        a23 = ae[7];
      var a31 = ae[2],
        a32 = ae[5],
        a33 = ae[8];
      var b11 = be[0],
        b12 = be[3],
        b13 = be[6];
      var b21 = be[1],
        b22 = be[4],
        b23 = be[7];
      var b31 = be[2],
        b32 = be[5],
        b33 = be[8];
      te[0] = a11 * b11 + a12 * b21 + a13 * b31;
      te[3] = a11 * b12 + a12 * b22 + a13 * b32;
      te[6] = a11 * b13 + a12 * b23 + a13 * b33;
      te[1] = a21 * b11 + a22 * b21 + a23 * b31;
      te[4] = a21 * b12 + a22 * b22 + a23 * b32;
      te[7] = a21 * b13 + a22 * b23 + a23 * b33;
      te[2] = a31 * b11 + a32 * b21 + a33 * b31;
      te[5] = a31 * b12 + a32 * b22 + a33 * b32;
      te[8] = a31 * b13 + a32 * b23 + a33 * b33;
      return this;
    }
  }, {
    key: "multiplyScalar",
    value: function multiplyScalar(s) {
      var te = this.elements;
      te[0] *= s;
      te[3] *= s;
      te[6] *= s;
      te[1] *= s;
      te[4] *= s;
      te[7] *= s;
      te[2] *= s;
      te[5] *= s;
      te[8] *= s;
      return this;
    }
  }, {
    key: "determinant",
    value: function determinant() {
      var te = this.elements;
      var a = te[0],
        b = te[1],
        c = te[2],
        d = te[3],
        e = te[4],
        f = te[5],
        g = te[6],
        h = te[7],
        i = te[8];
      return a * e * i - a * f * h - b * d * i + b * f * g + c * d * h - c * e * g;
    }
  }, {
    key: "invert",
    value: function invert() {
      var te = this.elements,
        n11 = te[0],
        n21 = te[1],
        n31 = te[2],
        n12 = te[3],
        n22 = te[4],
        n32 = te[5],
        n13 = te[6],
        n23 = te[7],
        n33 = te[8],
        t11 = n33 * n22 - n32 * n23,
        t12 = n32 * n13 - n33 * n12,
        t13 = n23 * n12 - n22 * n13,
        det = n11 * t11 + n21 * t12 + n31 * t13;
      if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0);
      var detInv = 1 / det;
      te[0] = t11 * detInv;
      te[1] = (n31 * n23 - n33 * n21) * detInv;
      te[2] = (n32 * n21 - n31 * n22) * detInv;
      te[3] = t12 * detInv;
      te[4] = (n33 * n11 - n31 * n13) * detInv;
      te[5] = (n31 * n12 - n32 * n11) * detInv;
      te[6] = t13 * detInv;
      te[7] = (n21 * n13 - n23 * n11) * detInv;
      te[8] = (n22 * n11 - n21 * n12) * detInv;
      return this;
    }
  }, {
    key: "transpose",
    value: function transpose() {
      var tmp;
      var m = this.elements;
      tmp = m[1];
      m[1] = m[3];
      m[3] = tmp;
      tmp = m[2];
      m[2] = m[6];
      m[6] = tmp;
      tmp = m[5];
      m[5] = m[7];
      m[7] = tmp;
      return this;
    }
  }, {
    key: "getNormalMatrix",
    value: function getNormalMatrix(matrix4) {
      return this.setFromMatrix4(matrix4).invert().transpose();
    }
  }, {
    key: "transposeIntoArray",
    value: function transposeIntoArray(r) {
      var m = this.elements;
      r[0] = m[0];
      r[1] = m[3];
      r[2] = m[6];
      r[3] = m[1];
      r[4] = m[4];
      r[5] = m[7];
      r[6] = m[2];
      r[7] = m[5];
      r[8] = m[8];
      return this;
    }
  }, {
    key: "setUvTransform",
    value: function setUvTransform(tx, ty, sx, sy, rotation, cx, cy) {
      var c = Math.cos(rotation);
      var s = Math.sin(rotation);
      this.set(sx * c, sx * s, -sx * (c * cx + s * cy) + cx + tx, -sy * s, sy * c, -sy * (-s * cx + c * cy) + cy + ty, 0, 0, 1);
      return this;
    }
  }, {
    key: "scale",
    value: function scale(sx, sy) {
      var te = this.elements;
      te[0] *= sx;
      te[3] *= sx;
      te[6] *= sx;
      te[1] *= sy;
      te[4] *= sy;
      te[7] *= sy;
      return this;
    }
  }, {
    key: "rotate",
    value: function rotate(theta) {
      var c = Math.cos(theta);
      var s = Math.sin(theta);
      var te = this.elements;
      var a11 = te[0],
        a12 = te[3],
        a13 = te[6];
      var a21 = te[1],
        a22 = te[4],
        a23 = te[7];
      te[0] = c * a11 + s * a21;
      te[3] = c * a12 + s * a22;
      te[6] = c * a13 + s * a23;
      te[1] = -s * a11 + c * a21;
      te[4] = -s * a12 + c * a22;
      te[7] = -s * a13 + c * a23;
      return this;
    }
  }, {
    key: "translate",
    value: function translate(tx, ty) {
      var te = this.elements;
      te[0] += tx * te[2];
      te[3] += tx * te[5];
      te[6] += tx * te[8];
      te[1] += ty * te[2];
      te[4] += ty * te[5];
      te[7] += ty * te[8];
      return this;
    }
  }, {
    key: "equals",
    value: function equals(matrix) {
      var te = this.elements;
      var me = matrix.elements;
      for (var i = 0; i < 9; i++) {
        if (te[i] !== me[i]) return false;
      }
      return true;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      for (var i = 0; i < 9; i++) {
        this.elements[i] = array[i + offset];
      }
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      var te = this.elements;
      array[offset] = te[0];
      array[offset + 1] = te[1];
      array[offset + 2] = te[2];
      array[offset + 3] = te[3];
      array[offset + 4] = te[4];
      array[offset + 5] = te[5];
      array[offset + 6] = te[6];
      array[offset + 7] = te[7];
      array[offset + 8] = te[8];
      return array;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor().fromArray(this.elements);
    }
  }]);
  return Matrix3;
}();
exports.Matrix3 = Matrix3;
Matrix3.prototype.isMatrix3 = true;
},{}],86:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Matrix4 = void 0;
var _Vector = require("./Vector3.js");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Matrix4 = /*#__PURE__*/function () {
  function Matrix4() {
    _classCallCheck(this, Matrix4);
    this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    if (arguments.length > 0) {
      console.error('THREE.Matrix4: the constructor no longer reads arguments. use .set() instead.');
    }
  }
  _createClass(Matrix4, [{
    key: "set",
    value: function set(n11, n12, n13, n14, n21, n22, n23, n24, n31, n32, n33, n34, n41, n42, n43, n44) {
      var te = this.elements;
      te[0] = n11;
      te[4] = n12;
      te[8] = n13;
      te[12] = n14;
      te[1] = n21;
      te[5] = n22;
      te[9] = n23;
      te[13] = n24;
      te[2] = n31;
      te[6] = n32;
      te[10] = n33;
      te[14] = n34;
      te[3] = n41;
      te[7] = n42;
      te[11] = n43;
      te[15] = n44;
      return this;
    }
  }, {
    key: "identity",
    value: function identity() {
      this.set(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new Matrix4().fromArray(this.elements);
    }
  }, {
    key: "copy",
    value: function copy(m) {
      var te = this.elements;
      var me = m.elements;
      te[0] = me[0];
      te[1] = me[1];
      te[2] = me[2];
      te[3] = me[3];
      te[4] = me[4];
      te[5] = me[5];
      te[6] = me[6];
      te[7] = me[7];
      te[8] = me[8];
      te[9] = me[9];
      te[10] = me[10];
      te[11] = me[11];
      te[12] = me[12];
      te[13] = me[13];
      te[14] = me[14];
      te[15] = me[15];
      return this;
    }
  }, {
    key: "copyPosition",
    value: function copyPosition(m) {
      var te = this.elements,
        me = m.elements;
      te[12] = me[12];
      te[13] = me[13];
      te[14] = me[14];
      return this;
    }
  }, {
    key: "setFromMatrix3",
    value: function setFromMatrix3(m) {
      var me = m.elements;
      this.set(me[0], me[3], me[6], 0, me[1], me[4], me[7], 0, me[2], me[5], me[8], 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "extractBasis",
    value: function extractBasis(xAxis, yAxis, zAxis) {
      xAxis.setFromMatrixColumn(this, 0);
      yAxis.setFromMatrixColumn(this, 1);
      zAxis.setFromMatrixColumn(this, 2);
      return this;
    }
  }, {
    key: "makeBasis",
    value: function makeBasis(xAxis, yAxis, zAxis) {
      this.set(xAxis.x, yAxis.x, zAxis.x, 0, xAxis.y, yAxis.y, zAxis.y, 0, xAxis.z, yAxis.z, zAxis.z, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "extractRotation",
    value: function extractRotation(m) {
      // this method does not support reflection matrices

      var te = this.elements;
      var me = m.elements;
      var scaleX = 1 / _v1.setFromMatrixColumn(m, 0).length();
      var scaleY = 1 / _v1.setFromMatrixColumn(m, 1).length();
      var scaleZ = 1 / _v1.setFromMatrixColumn(m, 2).length();
      te[0] = me[0] * scaleX;
      te[1] = me[1] * scaleX;
      te[2] = me[2] * scaleX;
      te[3] = 0;
      te[4] = me[4] * scaleY;
      te[5] = me[5] * scaleY;
      te[6] = me[6] * scaleY;
      te[7] = 0;
      te[8] = me[8] * scaleZ;
      te[9] = me[9] * scaleZ;
      te[10] = me[10] * scaleZ;
      te[11] = 0;
      te[12] = 0;
      te[13] = 0;
      te[14] = 0;
      te[15] = 1;
      return this;
    }
  }, {
    key: "makeRotationFromEuler",
    value: function makeRotationFromEuler(euler) {
      if (!(euler && euler.isEuler)) {
        console.error('THREE.Matrix4: .makeRotationFromEuler() now expects a Euler rotation rather than a Vector3 and order.');
      }
      var te = this.elements;
      var x = euler.x,
        y = euler.y,
        z = euler.z;
      var a = Math.cos(x),
        b = Math.sin(x);
      var c = Math.cos(y),
        d = Math.sin(y);
      var e = Math.cos(z),
        f = Math.sin(z);
      if (euler.order === 'XYZ') {
        var ae = a * e,
          af = a * f,
          be = b * e,
          bf = b * f;
        te[0] = c * e;
        te[4] = -c * f;
        te[8] = d;
        te[1] = af + be * d;
        te[5] = ae - bf * d;
        te[9] = -b * c;
        te[2] = bf - ae * d;
        te[6] = be + af * d;
        te[10] = a * c;
      } else if (euler.order === 'YXZ') {
        var ce = c * e,
          cf = c * f,
          de = d * e,
          df = d * f;
        te[0] = ce + df * b;
        te[4] = de * b - cf;
        te[8] = a * d;
        te[1] = a * f;
        te[5] = a * e;
        te[9] = -b;
        te[2] = cf * b - de;
        te[6] = df + ce * b;
        te[10] = a * c;
      } else if (euler.order === 'ZXY') {
        var _ce = c * e,
          _cf = c * f,
          _de = d * e,
          _df = d * f;
        te[0] = _ce - _df * b;
        te[4] = -a * f;
        te[8] = _de + _cf * b;
        te[1] = _cf + _de * b;
        te[5] = a * e;
        te[9] = _df - _ce * b;
        te[2] = -a * d;
        te[6] = b;
        te[10] = a * c;
      } else if (euler.order === 'ZYX') {
        var _ae = a * e,
          _af = a * f,
          _be = b * e,
          _bf = b * f;
        te[0] = c * e;
        te[4] = _be * d - _af;
        te[8] = _ae * d + _bf;
        te[1] = c * f;
        te[5] = _bf * d + _ae;
        te[9] = _af * d - _be;
        te[2] = -d;
        te[6] = b * c;
        te[10] = a * c;
      } else if (euler.order === 'YZX') {
        var ac = a * c,
          ad = a * d,
          bc = b * c,
          bd = b * d;
        te[0] = c * e;
        te[4] = bd - ac * f;
        te[8] = bc * f + ad;
        te[1] = f;
        te[5] = a * e;
        te[9] = -b * e;
        te[2] = -d * e;
        te[6] = ad * f + bc;
        te[10] = ac - bd * f;
      } else if (euler.order === 'XZY') {
        var _ac = a * c,
          _ad = a * d,
          _bc = b * c,
          _bd = b * d;
        te[0] = c * e;
        te[4] = -f;
        te[8] = d * e;
        te[1] = _ac * f + _bd;
        te[5] = a * e;
        te[9] = _ad * f - _bc;
        te[2] = _bc * f - _ad;
        te[6] = b * e;
        te[10] = _bd * f + _ac;
      }

      // bottom row
      te[3] = 0;
      te[7] = 0;
      te[11] = 0;

      // last column
      te[12] = 0;
      te[13] = 0;
      te[14] = 0;
      te[15] = 1;
      return this;
    }
  }, {
    key: "makeRotationFromQuaternion",
    value: function makeRotationFromQuaternion(q) {
      return this.compose(_zero, q, _one);
    }
  }, {
    key: "lookAt",
    value: function lookAt(eye, target, up) {
      var te = this.elements;
      _z.subVectors(eye, target);
      if (_z.lengthSq() === 0) {
        // eye and target are in the same position

        _z.z = 1;
      }
      _z.normalize();
      _x.crossVectors(up, _z);
      if (_x.lengthSq() === 0) {
        // up and z are parallel

        if (Math.abs(up.z) === 1) {
          _z.x += 0.0001;
        } else {
          _z.z += 0.0001;
        }
        _z.normalize();
        _x.crossVectors(up, _z);
      }
      _x.normalize();
      _y.crossVectors(_z, _x);
      te[0] = _x.x;
      te[4] = _y.x;
      te[8] = _z.x;
      te[1] = _x.y;
      te[5] = _y.y;
      te[9] = _z.y;
      te[2] = _x.z;
      te[6] = _y.z;
      te[10] = _z.z;
      return this;
    }
  }, {
    key: "multiply",
    value: function multiply(m, n) {
      if (n !== undefined) {
        console.warn('THREE.Matrix4: .multiply() now only accepts one argument. Use .multiplyMatrices( a, b ) instead.');
        return this.multiplyMatrices(m, n);
      }
      return this.multiplyMatrices(this, m);
    }
  }, {
    key: "premultiply",
    value: function premultiply(m) {
      return this.multiplyMatrices(m, this);
    }
  }, {
    key: "multiplyMatrices",
    value: function multiplyMatrices(a, b) {
      var ae = a.elements;
      var be = b.elements;
      var te = this.elements;
      var a11 = ae[0],
        a12 = ae[4],
        a13 = ae[8],
        a14 = ae[12];
      var a21 = ae[1],
        a22 = ae[5],
        a23 = ae[9],
        a24 = ae[13];
      var a31 = ae[2],
        a32 = ae[6],
        a33 = ae[10],
        a34 = ae[14];
      var a41 = ae[3],
        a42 = ae[7],
        a43 = ae[11],
        a44 = ae[15];
      var b11 = be[0],
        b12 = be[4],
        b13 = be[8],
        b14 = be[12];
      var b21 = be[1],
        b22 = be[5],
        b23 = be[9],
        b24 = be[13];
      var b31 = be[2],
        b32 = be[6],
        b33 = be[10],
        b34 = be[14];
      var b41 = be[3],
        b42 = be[7],
        b43 = be[11],
        b44 = be[15];
      te[0] = a11 * b11 + a12 * b21 + a13 * b31 + a14 * b41;
      te[4] = a11 * b12 + a12 * b22 + a13 * b32 + a14 * b42;
      te[8] = a11 * b13 + a12 * b23 + a13 * b33 + a14 * b43;
      te[12] = a11 * b14 + a12 * b24 + a13 * b34 + a14 * b44;
      te[1] = a21 * b11 + a22 * b21 + a23 * b31 + a24 * b41;
      te[5] = a21 * b12 + a22 * b22 + a23 * b32 + a24 * b42;
      te[9] = a21 * b13 + a22 * b23 + a23 * b33 + a24 * b43;
      te[13] = a21 * b14 + a22 * b24 + a23 * b34 + a24 * b44;
      te[2] = a31 * b11 + a32 * b21 + a33 * b31 + a34 * b41;
      te[6] = a31 * b12 + a32 * b22 + a33 * b32 + a34 * b42;
      te[10] = a31 * b13 + a32 * b23 + a33 * b33 + a34 * b43;
      te[14] = a31 * b14 + a32 * b24 + a33 * b34 + a34 * b44;
      te[3] = a41 * b11 + a42 * b21 + a43 * b31 + a44 * b41;
      te[7] = a41 * b12 + a42 * b22 + a43 * b32 + a44 * b42;
      te[11] = a41 * b13 + a42 * b23 + a43 * b33 + a44 * b43;
      te[15] = a41 * b14 + a42 * b24 + a43 * b34 + a44 * b44;
      return this;
    }
  }, {
    key: "multiplyScalar",
    value: function multiplyScalar(s) {
      var te = this.elements;
      te[0] *= s;
      te[4] *= s;
      te[8] *= s;
      te[12] *= s;
      te[1] *= s;
      te[5] *= s;
      te[9] *= s;
      te[13] *= s;
      te[2] *= s;
      te[6] *= s;
      te[10] *= s;
      te[14] *= s;
      te[3] *= s;
      te[7] *= s;
      te[11] *= s;
      te[15] *= s;
      return this;
    }
  }, {
    key: "determinant",
    value: function determinant() {
      var te = this.elements;
      var n11 = te[0],
        n12 = te[4],
        n13 = te[8],
        n14 = te[12];
      var n21 = te[1],
        n22 = te[5],
        n23 = te[9],
        n24 = te[13];
      var n31 = te[2],
        n32 = te[6],
        n33 = te[10],
        n34 = te[14];
      var n41 = te[3],
        n42 = te[7],
        n43 = te[11],
        n44 = te[15];

      //TODO: make this more efficient
      //( based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm )

      return n41 * (+n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34) + n42 * (+n11 * n23 * n34 - n11 * n24 * n33 + n14 * n21 * n33 - n13 * n21 * n34 + n13 * n24 * n31 - n14 * n23 * n31) + n43 * (+n11 * n24 * n32 - n11 * n22 * n34 - n14 * n21 * n32 + n12 * n21 * n34 + n14 * n22 * n31 - n12 * n24 * n31) + n44 * (-n13 * n22 * n31 - n11 * n23 * n32 + n11 * n22 * n33 + n13 * n21 * n32 - n12 * n21 * n33 + n12 * n23 * n31);
    }
  }, {
    key: "transpose",
    value: function transpose() {
      var te = this.elements;
      var tmp;
      tmp = te[1];
      te[1] = te[4];
      te[4] = tmp;
      tmp = te[2];
      te[2] = te[8];
      te[8] = tmp;
      tmp = te[6];
      te[6] = te[9];
      te[9] = tmp;
      tmp = te[3];
      te[3] = te[12];
      te[12] = tmp;
      tmp = te[7];
      te[7] = te[13];
      te[13] = tmp;
      tmp = te[11];
      te[11] = te[14];
      te[14] = tmp;
      return this;
    }
  }, {
    key: "setPosition",
    value: function setPosition(x, y, z) {
      var te = this.elements;
      if (x.isVector3) {
        te[12] = x.x;
        te[13] = x.y;
        te[14] = x.z;
      } else {
        te[12] = x;
        te[13] = y;
        te[14] = z;
      }
      return this;
    }
  }, {
    key: "invert",
    value: function invert() {
      // based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
      var te = this.elements,
        n11 = te[0],
        n21 = te[1],
        n31 = te[2],
        n41 = te[3],
        n12 = te[4],
        n22 = te[5],
        n32 = te[6],
        n42 = te[7],
        n13 = te[8],
        n23 = te[9],
        n33 = te[10],
        n43 = te[11],
        n14 = te[12],
        n24 = te[13],
        n34 = te[14],
        n44 = te[15],
        t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44,
        t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44,
        t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44,
        t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
      var det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
      if (det === 0) return this.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      var detInv = 1 / det;
      te[0] = t11 * detInv;
      te[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
      te[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
      te[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;
      te[4] = t12 * detInv;
      te[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
      te[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
      te[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;
      te[8] = t13 * detInv;
      te[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
      te[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
      te[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;
      te[12] = t14 * detInv;
      te[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
      te[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
      te[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
      return this;
    }
  }, {
    key: "scale",
    value: function scale(v) {
      var te = this.elements;
      var x = v.x,
        y = v.y,
        z = v.z;
      te[0] *= x;
      te[4] *= y;
      te[8] *= z;
      te[1] *= x;
      te[5] *= y;
      te[9] *= z;
      te[2] *= x;
      te[6] *= y;
      te[10] *= z;
      te[3] *= x;
      te[7] *= y;
      te[11] *= z;
      return this;
    }
  }, {
    key: "getMaxScaleOnAxis",
    value: function getMaxScaleOnAxis() {
      var te = this.elements;
      var scaleXSq = te[0] * te[0] + te[1] * te[1] + te[2] * te[2];
      var scaleYSq = te[4] * te[4] + te[5] * te[5] + te[6] * te[6];
      var scaleZSq = te[8] * te[8] + te[9] * te[9] + te[10] * te[10];
      return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
    }
  }, {
    key: "makeTranslation",
    value: function makeTranslation(x, y, z) {
      this.set(1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "makeRotationX",
    value: function makeRotationX(theta) {
      var c = Math.cos(theta),
        s = Math.sin(theta);
      this.set(1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "makeRotationY",
    value: function makeRotationY(theta) {
      var c = Math.cos(theta),
        s = Math.sin(theta);
      this.set(c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "makeRotationZ",
    value: function makeRotationZ(theta) {
      var c = Math.cos(theta),
        s = Math.sin(theta);
      this.set(c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "makeRotationAxis",
    value: function makeRotationAxis(axis, angle) {
      // Based on http://www.gamedev.net/reference/articles/article1199.asp

      var c = Math.cos(angle);
      var s = Math.sin(angle);
      var t = 1 - c;
      var x = axis.x,
        y = axis.y,
        z = axis.z;
      var tx = t * x,
        ty = t * y;
      this.set(tx * x + c, tx * y - s * z, tx * z + s * y, 0, tx * y + s * z, ty * y + c, ty * z - s * x, 0, tx * z - s * y, ty * z + s * x, t * z * z + c, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "makeScale",
    value: function makeScale(x, y, z) {
      this.set(x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "makeShear",
    value: function makeShear(xy, xz, yx, yz, zx, zy) {
      this.set(1, yx, zx, 0, xy, 1, zy, 0, xz, yz, 1, 0, 0, 0, 0, 1);
      return this;
    }
  }, {
    key: "compose",
    value: function compose(position, quaternion, scale) {
      var te = this.elements;
      var x = quaternion._x,
        y = quaternion._y,
        z = quaternion._z,
        w = quaternion._w;
      var x2 = x + x,
        y2 = y + y,
        z2 = z + z;
      var xx = x * x2,
        xy = x * y2,
        xz = x * z2;
      var yy = y * y2,
        yz = y * z2,
        zz = z * z2;
      var wx = w * x2,
        wy = w * y2,
        wz = w * z2;
      var sx = scale.x,
        sy = scale.y,
        sz = scale.z;
      te[0] = (1 - (yy + zz)) * sx;
      te[1] = (xy + wz) * sx;
      te[2] = (xz - wy) * sx;
      te[3] = 0;
      te[4] = (xy - wz) * sy;
      te[5] = (1 - (xx + zz)) * sy;
      te[6] = (yz + wx) * sy;
      te[7] = 0;
      te[8] = (xz + wy) * sz;
      te[9] = (yz - wx) * sz;
      te[10] = (1 - (xx + yy)) * sz;
      te[11] = 0;
      te[12] = position.x;
      te[13] = position.y;
      te[14] = position.z;
      te[15] = 1;
      return this;
    }
  }, {
    key: "decompose",
    value: function decompose(position, quaternion, scale) {
      var te = this.elements;
      var sx = _v1.set(te[0], te[1], te[2]).length();
      var sy = _v1.set(te[4], te[5], te[6]).length();
      var sz = _v1.set(te[8], te[9], te[10]).length();

      // if determine is negative, we need to invert one scale
      var det = this.determinant();
      if (det < 0) sx = -sx;
      position.x = te[12];
      position.y = te[13];
      position.z = te[14];

      // scale the rotation part
      _m1.copy(this);
      var invSX = 1 / sx;
      var invSY = 1 / sy;
      var invSZ = 1 / sz;
      _m1.elements[0] *= invSX;
      _m1.elements[1] *= invSX;
      _m1.elements[2] *= invSX;
      _m1.elements[4] *= invSY;
      _m1.elements[5] *= invSY;
      _m1.elements[6] *= invSY;
      _m1.elements[8] *= invSZ;
      _m1.elements[9] *= invSZ;
      _m1.elements[10] *= invSZ;
      quaternion.setFromRotationMatrix(_m1);
      scale.x = sx;
      scale.y = sy;
      scale.z = sz;
      return this;
    }
  }, {
    key: "makePerspective",
    value: function makePerspective(left, right, top, bottom, near, far) {
      if (far === undefined) {
        console.warn('THREE.Matrix4: .makePerspective() has been redefined and has a new signature. Please check the docs.');
      }
      var te = this.elements;
      var x = 2 * near / (right - left);
      var y = 2 * near / (top - bottom);
      var a = (right + left) / (right - left);
      var b = (top + bottom) / (top - bottom);
      var c = -(far + near) / (far - near);
      var d = -2 * far * near / (far - near);
      te[0] = x;
      te[4] = 0;
      te[8] = a;
      te[12] = 0;
      te[1] = 0;
      te[5] = y;
      te[9] = b;
      te[13] = 0;
      te[2] = 0;
      te[6] = 0;
      te[10] = c;
      te[14] = d;
      te[3] = 0;
      te[7] = 0;
      te[11] = -1;
      te[15] = 0;
      return this;
    }
  }, {
    key: "makeOrthographic",
    value: function makeOrthographic(left, right, top, bottom, near, far) {
      var te = this.elements;
      var w = 1.0 / (right - left);
      var h = 1.0 / (top - bottom);
      var p = 1.0 / (far - near);
      var x = (right + left) * w;
      var y = (top + bottom) * h;
      var z = (far + near) * p;
      te[0] = 2 * w;
      te[4] = 0;
      te[8] = 0;
      te[12] = -x;
      te[1] = 0;
      te[5] = 2 * h;
      te[9] = 0;
      te[13] = -y;
      te[2] = 0;
      te[6] = 0;
      te[10] = -2 * p;
      te[14] = -z;
      te[3] = 0;
      te[7] = 0;
      te[11] = 0;
      te[15] = 1;
      return this;
    }
  }, {
    key: "equals",
    value: function equals(matrix) {
      var te = this.elements;
      var me = matrix.elements;
      for (var i = 0; i < 16; i++) {
        if (te[i] !== me[i]) return false;
      }
      return true;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      for (var i = 0; i < 16; i++) {
        this.elements[i] = array[i + offset];
      }
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      var te = this.elements;
      array[offset] = te[0];
      array[offset + 1] = te[1];
      array[offset + 2] = te[2];
      array[offset + 3] = te[3];
      array[offset + 4] = te[4];
      array[offset + 5] = te[5];
      array[offset + 6] = te[6];
      array[offset + 7] = te[7];
      array[offset + 8] = te[8];
      array[offset + 9] = te[9];
      array[offset + 10] = te[10];
      array[offset + 11] = te[11];
      array[offset + 12] = te[12];
      array[offset + 13] = te[13];
      array[offset + 14] = te[14];
      array[offset + 15] = te[15];
      return array;
    }
  }]);
  return Matrix4;
}();
exports.Matrix4 = Matrix4;
Matrix4.prototype.isMatrix4 = true;
var _v1 = /*@__PURE__*/new _Vector.Vector3();
var _m1 = /*@__PURE__*/new Matrix4();
var _zero = /*@__PURE__*/new _Vector.Vector3(0, 0, 0);
var _one = /*@__PURE__*/new _Vector.Vector3(1, 1, 1);
var _x = /*@__PURE__*/new _Vector.Vector3();
var _y = /*@__PURE__*/new _Vector.Vector3();
var _z = /*@__PURE__*/new _Vector.Vector3();
},{"./Vector3.js":90}],87:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Quaternion = void 0;
var MathUtils = _interopRequireWildcard(require("./MathUtils.js"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Quaternion = /*#__PURE__*/function () {
  function Quaternion() {
    var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var w = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;
    _classCallCheck(this, Quaternion);
    this._x = x;
    this._y = y;
    this._z = z;
    this._w = w;
  }
  _createClass(Quaternion, [{
    key: "x",
    get: function get() {
      return this._x;
    },
    set: function set(value) {
      this._x = value;
      this._onChangeCallback();
    }
  }, {
    key: "y",
    get: function get() {
      return this._y;
    },
    set: function set(value) {
      this._y = value;
      this._onChangeCallback();
    }
  }, {
    key: "z",
    get: function get() {
      return this._z;
    },
    set: function set(value) {
      this._z = value;
      this._onChangeCallback();
    }
  }, {
    key: "w",
    get: function get() {
      return this._w;
    },
    set: function set(value) {
      this._w = value;
      this._onChangeCallback();
    }
  }, {
    key: "set",
    value: function set(x, y, z, w) {
      this._x = x;
      this._y = y;
      this._z = z;
      this._w = w;
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor(this._x, this._y, this._z, this._w);
    }
  }, {
    key: "copy",
    value: function copy(quaternion) {
      this._x = quaternion.x;
      this._y = quaternion.y;
      this._z = quaternion.z;
      this._w = quaternion.w;
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "setFromEuler",
    value: function setFromEuler(euler, update) {
      if (!(euler && euler.isEuler)) {
        throw new Error('THREE.Quaternion: .setFromEuler() now expects an Euler rotation rather than a Vector3 and order.');
      }
      var x = euler._x,
        y = euler._y,
        z = euler._z,
        order = euler._order;

      // http://www.mathworks.com/matlabcentral/fileexchange/
      // 	20696-function-to-convert-between-dcm-euler-angles-quaternions-and-euler-vectors/
      //	content/SpinCalc.m

      var cos = Math.cos;
      var sin = Math.sin;
      var c1 = cos(x / 2);
      var c2 = cos(y / 2);
      var c3 = cos(z / 2);
      var s1 = sin(x / 2);
      var s2 = sin(y / 2);
      var s3 = sin(z / 2);
      switch (order) {
        case 'XYZ':
          this._x = s1 * c2 * c3 + c1 * s2 * s3;
          this._y = c1 * s2 * c3 - s1 * c2 * s3;
          this._z = c1 * c2 * s3 + s1 * s2 * c3;
          this._w = c1 * c2 * c3 - s1 * s2 * s3;
          break;
        case 'YXZ':
          this._x = s1 * c2 * c3 + c1 * s2 * s3;
          this._y = c1 * s2 * c3 - s1 * c2 * s3;
          this._z = c1 * c2 * s3 - s1 * s2 * c3;
          this._w = c1 * c2 * c3 + s1 * s2 * s3;
          break;
        case 'ZXY':
          this._x = s1 * c2 * c3 - c1 * s2 * s3;
          this._y = c1 * s2 * c3 + s1 * c2 * s3;
          this._z = c1 * c2 * s3 + s1 * s2 * c3;
          this._w = c1 * c2 * c3 - s1 * s2 * s3;
          break;
        case 'ZYX':
          this._x = s1 * c2 * c3 - c1 * s2 * s3;
          this._y = c1 * s2 * c3 + s1 * c2 * s3;
          this._z = c1 * c2 * s3 - s1 * s2 * c3;
          this._w = c1 * c2 * c3 + s1 * s2 * s3;
          break;
        case 'YZX':
          this._x = s1 * c2 * c3 + c1 * s2 * s3;
          this._y = c1 * s2 * c3 + s1 * c2 * s3;
          this._z = c1 * c2 * s3 - s1 * s2 * c3;
          this._w = c1 * c2 * c3 - s1 * s2 * s3;
          break;
        case 'XZY':
          this._x = s1 * c2 * c3 - c1 * s2 * s3;
          this._y = c1 * s2 * c3 - s1 * c2 * s3;
          this._z = c1 * c2 * s3 + s1 * s2 * c3;
          this._w = c1 * c2 * c3 + s1 * s2 * s3;
          break;
        default:
          console.warn('THREE.Quaternion: .setFromEuler() encountered an unknown order: ' + order);
      }
      if (update !== false) this._onChangeCallback();
      return this;
    }
  }, {
    key: "setFromAxisAngle",
    value: function setFromAxisAngle(axis, angle) {
      // http://www.euclideanspace.com/maths/geometry/rotations/conversions/angleToQuaternion/index.htm

      // assumes axis is normalized

      var halfAngle = angle / 2,
        s = Math.sin(halfAngle);
      this._x = axis.x * s;
      this._y = axis.y * s;
      this._z = axis.z * s;
      this._w = Math.cos(halfAngle);
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "setFromRotationMatrix",
    value: function setFromRotationMatrix(m) {
      // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm

      // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

      var te = m.elements,
        m11 = te[0],
        m12 = te[4],
        m13 = te[8],
        m21 = te[1],
        m22 = te[5],
        m23 = te[9],
        m31 = te[2],
        m32 = te[6],
        m33 = te[10],
        trace = m11 + m22 + m33;
      if (trace > 0) {
        var s = 0.5 / Math.sqrt(trace + 1.0);
        this._w = 0.25 / s;
        this._x = (m32 - m23) * s;
        this._y = (m13 - m31) * s;
        this._z = (m21 - m12) * s;
      } else if (m11 > m22 && m11 > m33) {
        var _s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
        this._w = (m32 - m23) / _s;
        this._x = 0.25 * _s;
        this._y = (m12 + m21) / _s;
        this._z = (m13 + m31) / _s;
      } else if (m22 > m33) {
        var _s2 = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
        this._w = (m13 - m31) / _s2;
        this._x = (m12 + m21) / _s2;
        this._y = 0.25 * _s2;
        this._z = (m23 + m32) / _s2;
      } else {
        var _s3 = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
        this._w = (m21 - m12) / _s3;
        this._x = (m13 + m31) / _s3;
        this._y = (m23 + m32) / _s3;
        this._z = 0.25 * _s3;
      }
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "setFromUnitVectors",
    value: function setFromUnitVectors(vFrom, vTo) {
      // assumes direction vectors vFrom and vTo are normalized

      var r = vFrom.dot(vTo) + 1;
      if (r < Number.EPSILON) {
        // vFrom and vTo point in opposite directions

        r = 0;
        if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
          this._x = -vFrom.y;
          this._y = vFrom.x;
          this._z = 0;
          this._w = r;
        } else {
          this._x = 0;
          this._y = -vFrom.z;
          this._z = vFrom.y;
          this._w = r;
        }
      } else {
        // crossVectors( vFrom, vTo ); // inlined to avoid cyclic dependency on Vector3

        this._x = vFrom.y * vTo.z - vFrom.z * vTo.y;
        this._y = vFrom.z * vTo.x - vFrom.x * vTo.z;
        this._z = vFrom.x * vTo.y - vFrom.y * vTo.x;
        this._w = r;
      }
      return this.normalize();
    }
  }, {
    key: "angleTo",
    value: function angleTo(q) {
      return 2 * Math.acos(Math.abs(MathUtils.clamp(this.dot(q), -1, 1)));
    }
  }, {
    key: "rotateTowards",
    value: function rotateTowards(q, step) {
      var angle = this.angleTo(q);
      if (angle === 0) return this;
      var t = Math.min(1, step / angle);
      this.slerp(q, t);
      return this;
    }
  }, {
    key: "identity",
    value: function identity() {
      return this.set(0, 0, 0, 1);
    }
  }, {
    key: "invert",
    value: function invert() {
      // quaternion is assumed to have unit length

      return this.conjugate();
    }
  }, {
    key: "conjugate",
    value: function conjugate() {
      this._x *= -1;
      this._y *= -1;
      this._z *= -1;
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "dot",
    value: function dot(v) {
      return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
    }
  }, {
    key: "lengthSq",
    value: function lengthSq() {
      return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
    }
  }, {
    key: "length",
    value: function length() {
      return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
    }
  }, {
    key: "normalize",
    value: function normalize() {
      var l = this.length();
      if (l === 0) {
        this._x = 0;
        this._y = 0;
        this._z = 0;
        this._w = 1;
      } else {
        l = 1 / l;
        this._x = this._x * l;
        this._y = this._y * l;
        this._z = this._z * l;
        this._w = this._w * l;
      }
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "multiply",
    value: function multiply(q, p) {
      if (p !== undefined) {
        console.warn('THREE.Quaternion: .multiply() now only accepts one argument. Use .multiplyQuaternions( a, b ) instead.');
        return this.multiplyQuaternions(q, p);
      }
      return this.multiplyQuaternions(this, q);
    }
  }, {
    key: "premultiply",
    value: function premultiply(q) {
      return this.multiplyQuaternions(q, this);
    }
  }, {
    key: "multiplyQuaternions",
    value: function multiplyQuaternions(a, b) {
      // from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm

      var qax = a._x,
        qay = a._y,
        qaz = a._z,
        qaw = a._w;
      var qbx = b._x,
        qby = b._y,
        qbz = b._z,
        qbw = b._w;
      this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
      this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
      this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
      this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "slerp",
    value: function slerp(qb, t) {
      if (t === 0) return this;
      if (t === 1) return this.copy(qb);
      var x = this._x,
        y = this._y,
        z = this._z,
        w = this._w;

      // http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/slerp/

      var cosHalfTheta = w * qb._w + x * qb._x + y * qb._y + z * qb._z;
      if (cosHalfTheta < 0) {
        this._w = -qb._w;
        this._x = -qb._x;
        this._y = -qb._y;
        this._z = -qb._z;
        cosHalfTheta = -cosHalfTheta;
      } else {
        this.copy(qb);
      }
      if (cosHalfTheta >= 1.0) {
        this._w = w;
        this._x = x;
        this._y = y;
        this._z = z;
        return this;
      }
      var sqrSinHalfTheta = 1.0 - cosHalfTheta * cosHalfTheta;
      if (sqrSinHalfTheta <= Number.EPSILON) {
        var s = 1 - t;
        this._w = s * w + t * this._w;
        this._x = s * x + t * this._x;
        this._y = s * y + t * this._y;
        this._z = s * z + t * this._z;
        this.normalize();
        this._onChangeCallback();
        return this;
      }
      var sinHalfTheta = Math.sqrt(sqrSinHalfTheta);
      var halfTheta = Math.atan2(sinHalfTheta, cosHalfTheta);
      var ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta,
        ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
      this._w = w * ratioA + this._w * ratioB;
      this._x = x * ratioA + this._x * ratioB;
      this._y = y * ratioA + this._y * ratioB;
      this._z = z * ratioA + this._z * ratioB;
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "slerpQuaternions",
    value: function slerpQuaternions(qa, qb, t) {
      return this.copy(qa).slerp(qb, t);
    }
  }, {
    key: "random",
    value: function random() {
      // Derived from http://planning.cs.uiuc.edu/node198.html
      // Note, this source uses w, x, y, z ordering,
      // so we swap the order below.

      var u1 = Math.random();
      var sqrt1u1 = Math.sqrt(1 - u1);
      var sqrtu1 = Math.sqrt(u1);
      var u2 = 2 * Math.PI * Math.random();
      var u3 = 2 * Math.PI * Math.random();
      return this.set(sqrt1u1 * Math.cos(u2), sqrtu1 * Math.sin(u3), sqrtu1 * Math.cos(u3), sqrt1u1 * Math.sin(u2));
    }
  }, {
    key: "equals",
    value: function equals(quaternion) {
      return quaternion._x === this._x && quaternion._y === this._y && quaternion._z === this._z && quaternion._w === this._w;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this._x = array[offset];
      this._y = array[offset + 1];
      this._z = array[offset + 2];
      this._w = array[offset + 3];
      this._onChangeCallback();
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      array[offset] = this._x;
      array[offset + 1] = this._y;
      array[offset + 2] = this._z;
      array[offset + 3] = this._w;
      return array;
    }
  }, {
    key: "fromBufferAttribute",
    value: function fromBufferAttribute(attribute, index) {
      this._x = attribute.getX(index);
      this._y = attribute.getY(index);
      this._z = attribute.getZ(index);
      this._w = attribute.getW(index);
      return this;
    }
  }, {
    key: "_onChange",
    value: function _onChange(callback) {
      this._onChangeCallback = callback;
      return this;
    }
  }, {
    key: "_onChangeCallback",
    value: function _onChangeCallback() {}
  }], [{
    key: "slerp",
    value: function slerp(qa, qb, qm, t) {
      console.warn('THREE.Quaternion: Static .slerp() has been deprecated. Use qm.slerpQuaternions( qa, qb, t ) instead.');
      return qm.slerpQuaternions(qa, qb, t);
    }
  }, {
    key: "slerpFlat",
    value: function slerpFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1, t) {
      // fuzz-free, array-based Quaternion SLERP operation

      var x0 = src0[srcOffset0 + 0],
        y0 = src0[srcOffset0 + 1],
        z0 = src0[srcOffset0 + 2],
        w0 = src0[srcOffset0 + 3];
      var x1 = src1[srcOffset1 + 0],
        y1 = src1[srcOffset1 + 1],
        z1 = src1[srcOffset1 + 2],
        w1 = src1[srcOffset1 + 3];
      if (t === 0) {
        dst[dstOffset + 0] = x0;
        dst[dstOffset + 1] = y0;
        dst[dstOffset + 2] = z0;
        dst[dstOffset + 3] = w0;
        return;
      }
      if (t === 1) {
        dst[dstOffset + 0] = x1;
        dst[dstOffset + 1] = y1;
        dst[dstOffset + 2] = z1;
        dst[dstOffset + 3] = w1;
        return;
      }
      if (w0 !== w1 || x0 !== x1 || y0 !== y1 || z0 !== z1) {
        var s = 1 - t;
        var cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1,
          dir = cos >= 0 ? 1 : -1,
          sqrSin = 1 - cos * cos;

        // Skip the Slerp for tiny steps to avoid numeric problems:
        if (sqrSin > Number.EPSILON) {
          var sin = Math.sqrt(sqrSin),
            len = Math.atan2(sin, cos * dir);
          s = Math.sin(s * len) / sin;
          t = Math.sin(t * len) / sin;
        }
        var tDir = t * dir;
        x0 = x0 * s + x1 * tDir;
        y0 = y0 * s + y1 * tDir;
        z0 = z0 * s + z1 * tDir;
        w0 = w0 * s + w1 * tDir;

        // Normalize in case we just did a lerp:
        if (s === 1 - t) {
          var f = 1 / Math.sqrt(x0 * x0 + y0 * y0 + z0 * z0 + w0 * w0);
          x0 *= f;
          y0 *= f;
          z0 *= f;
          w0 *= f;
        }
      }
      dst[dstOffset] = x0;
      dst[dstOffset + 1] = y0;
      dst[dstOffset + 2] = z0;
      dst[dstOffset + 3] = w0;
    }
  }, {
    key: "multiplyQuaternionsFlat",
    value: function multiplyQuaternionsFlat(dst, dstOffset, src0, srcOffset0, src1, srcOffset1) {
      var x0 = src0[srcOffset0];
      var y0 = src0[srcOffset0 + 1];
      var z0 = src0[srcOffset0 + 2];
      var w0 = src0[srcOffset0 + 3];
      var x1 = src1[srcOffset1];
      var y1 = src1[srcOffset1 + 1];
      var z1 = src1[srcOffset1 + 2];
      var w1 = src1[srcOffset1 + 3];
      dst[dstOffset] = x0 * w1 + w0 * x1 + y0 * z1 - z0 * y1;
      dst[dstOffset + 1] = y0 * w1 + w0 * y1 + z0 * x1 - x0 * z1;
      dst[dstOffset + 2] = z0 * w1 + w0 * z1 + x0 * y1 - y0 * x1;
      dst[dstOffset + 3] = w0 * w1 - x0 * x1 - y0 * y1 - z0 * z1;
      return dst;
    }
  }]);
  return Quaternion;
}();
exports.Quaternion = Quaternion;
Quaternion.prototype.isQuaternion = true;
},{"./MathUtils.js":84}],88:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Sphere = void 0;
var _Box = require("./Box3.js");
var _Vector = require("./Vector3.js");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var _box = /*@__PURE__*/new _Box.Box3();
var _v1 = /*@__PURE__*/new _Vector.Vector3();
var _toFarthestPoint = /*@__PURE__*/new _Vector.Vector3();
var _toPoint = /*@__PURE__*/new _Vector.Vector3();
var Sphere = /*#__PURE__*/function () {
  function Sphere() {
    var center = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : new _Vector.Vector3();
    var radius = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : -1;
    _classCallCheck(this, Sphere);
    this.center = center;
    this.radius = radius;
  }
  _createClass(Sphere, [{
    key: "set",
    value: function set(center, radius) {
      this.center.copy(center);
      this.radius = radius;
      return this;
    }
  }, {
    key: "setFromPoints",
    value: function setFromPoints(points, optionalCenter) {
      var center = this.center;
      if (optionalCenter !== undefined) {
        center.copy(optionalCenter);
      } else {
        _box.setFromPoints(points).getCenter(center);
      }
      var maxRadiusSq = 0;
      for (var i = 0, il = points.length; i < il; i++) {
        maxRadiusSq = Math.max(maxRadiusSq, center.distanceToSquared(points[i]));
      }
      this.radius = Math.sqrt(maxRadiusSq);
      return this;
    }
  }, {
    key: "copy",
    value: function copy(sphere) {
      this.center.copy(sphere.center);
      this.radius = sphere.radius;
      return this;
    }
  }, {
    key: "isEmpty",
    value: function isEmpty() {
      return this.radius < 0;
    }
  }, {
    key: "makeEmpty",
    value: function makeEmpty() {
      this.center.set(0, 0, 0);
      this.radius = -1;
      return this;
    }
  }, {
    key: "containsPoint",
    value: function containsPoint(point) {
      return point.distanceToSquared(this.center) <= this.radius * this.radius;
    }
  }, {
    key: "distanceToPoint",
    value: function distanceToPoint(point) {
      return point.distanceTo(this.center) - this.radius;
    }
  }, {
    key: "intersectsSphere",
    value: function intersectsSphere(sphere) {
      var radiusSum = this.radius + sphere.radius;
      return sphere.center.distanceToSquared(this.center) <= radiusSum * radiusSum;
    }
  }, {
    key: "intersectsBox",
    value: function intersectsBox(box) {
      return box.intersectsSphere(this);
    }
  }, {
    key: "intersectsPlane",
    value: function intersectsPlane(plane) {
      return Math.abs(plane.distanceToPoint(this.center)) <= this.radius;
    }
  }, {
    key: "clampPoint",
    value: function clampPoint(point, target) {
      var deltaLengthSq = this.center.distanceToSquared(point);
      target.copy(point);
      if (deltaLengthSq > this.radius * this.radius) {
        target.sub(this.center).normalize();
        target.multiplyScalar(this.radius).add(this.center);
      }
      return target;
    }
  }, {
    key: "getBoundingBox",
    value: function getBoundingBox(target) {
      if (this.isEmpty()) {
        // Empty sphere produces empty bounding box
        target.makeEmpty();
        return target;
      }
      target.set(this.center, this.center);
      target.expandByScalar(this.radius);
      return target;
    }
  }, {
    key: "applyMatrix4",
    value: function applyMatrix4(matrix) {
      this.center.applyMatrix4(matrix);
      this.radius = this.radius * matrix.getMaxScaleOnAxis();
      return this;
    }
  }, {
    key: "translate",
    value: function translate(offset) {
      this.center.add(offset);
      return this;
    }
  }, {
    key: "expandByPoint",
    value: function expandByPoint(point) {
      // from https://github.com/juj/MathGeoLib/blob/2940b99b99cfe575dd45103ef20f4019dee15b54/src/Geometry/Sphere.cpp#L649-L671

      _toPoint.subVectors(point, this.center);
      var lengthSq = _toPoint.lengthSq();
      if (lengthSq > this.radius * this.radius) {
        var length = Math.sqrt(lengthSq);
        var missingRadiusHalf = (length - this.radius) * 0.5;

        // Nudge this sphere towards the target point. Add half the missing distance to radius,
        // and the other half to position. This gives a tighter enclosure, instead of if
        // the whole missing distance were just added to radius.

        this.center.add(_toPoint.multiplyScalar(missingRadiusHalf / length));
        this.radius += missingRadiusHalf;
      }
      return this;
    }
  }, {
    key: "union",
    value: function union(sphere) {
      // from https://github.com/juj/MathGeoLib/blob/2940b99b99cfe575dd45103ef20f4019dee15b54/src/Geometry/Sphere.cpp#L759-L769

      // To enclose another sphere into this sphere, we only need to enclose two points:
      // 1) Enclose the farthest point on the other sphere into this sphere.
      // 2) Enclose the opposite point of the farthest point into this sphere.

      if (this.center.equals(sphere.center) === true) {
        _toFarthestPoint.set(0, 0, 1).multiplyScalar(sphere.radius);
      } else {
        _toFarthestPoint.subVectors(sphere.center, this.center).normalize().multiplyScalar(sphere.radius);
      }
      this.expandByPoint(_v1.copy(sphere.center).add(_toFarthestPoint));
      this.expandByPoint(_v1.copy(sphere.center).sub(_toFarthestPoint));
      return this;
    }
  }, {
    key: "equals",
    value: function equals(sphere) {
      return sphere.center.equals(this.center) && sphere.radius === this.radius;
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor().copy(this);
    }
  }]);
  return Sphere;
}();
exports.Sphere = Sphere;
},{"./Box3.js":80,"./Vector3.js":90}],89:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Vector2 = void 0;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, catch: function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Vector2 = /*#__PURE__*/function (_Symbol$iterator) {
  function Vector2() {
    var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    _classCallCheck(this, Vector2);
    this.x = x;
    this.y = y;
  }
  _createClass(Vector2, [{
    key: "width",
    get: function get() {
      return this.x;
    },
    set: function set(value) {
      this.x = value;
    }
  }, {
    key: "height",
    get: function get() {
      return this.y;
    },
    set: function set(value) {
      this.y = value;
    }
  }, {
    key: "set",
    value: function set(x, y) {
      this.x = x;
      this.y = y;
      return this;
    }
  }, {
    key: "setScalar",
    value: function setScalar(scalar) {
      this.x = scalar;
      this.y = scalar;
      return this;
    }
  }, {
    key: "setX",
    value: function setX(x) {
      this.x = x;
      return this;
    }
  }, {
    key: "setY",
    value: function setY(y) {
      this.y = y;
      return this;
    }
  }, {
    key: "setComponent",
    value: function setComponent(index, value) {
      switch (index) {
        case 0:
          this.x = value;
          break;
        case 1:
          this.y = value;
          break;
        default:
          throw new Error('index is out of range: ' + index);
      }
      return this;
    }
  }, {
    key: "getComponent",
    value: function getComponent(index) {
      switch (index) {
        case 0:
          return this.x;
        case 1:
          return this.y;
        default:
          throw new Error('index is out of range: ' + index);
      }
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor(this.x, this.y);
    }
  }, {
    key: "copy",
    value: function copy(v) {
      this.x = v.x;
      this.y = v.y;
      return this;
    }
  }, {
    key: "add",
    value: function add(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector2: .add() now only accepts one argument. Use .addVectors( a, b ) instead.');
        return this.addVectors(v, w);
      }
      this.x += v.x;
      this.y += v.y;
      return this;
    }
  }, {
    key: "addScalar",
    value: function addScalar(s) {
      this.x += s;
      this.y += s;
      return this;
    }
  }, {
    key: "addVectors",
    value: function addVectors(a, b) {
      this.x = a.x + b.x;
      this.y = a.y + b.y;
      return this;
    }
  }, {
    key: "addScaledVector",
    value: function addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      return this;
    }
  }, {
    key: "sub",
    value: function sub(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector2: .sub() now only accepts one argument. Use .subVectors( a, b ) instead.');
        return this.subVectors(v, w);
      }
      this.x -= v.x;
      this.y -= v.y;
      return this;
    }
  }, {
    key: "subScalar",
    value: function subScalar(s) {
      this.x -= s;
      this.y -= s;
      return this;
    }
  }, {
    key: "subVectors",
    value: function subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      return this;
    }
  }, {
    key: "multiply",
    value: function multiply(v) {
      this.x *= v.x;
      this.y *= v.y;
      return this;
    }
  }, {
    key: "multiplyScalar",
    value: function multiplyScalar(scalar) {
      this.x *= scalar;
      this.y *= scalar;
      return this;
    }
  }, {
    key: "divide",
    value: function divide(v) {
      this.x /= v.x;
      this.y /= v.y;
      return this;
    }
  }, {
    key: "divideScalar",
    value: function divideScalar(scalar) {
      return this.multiplyScalar(1 / scalar);
    }
  }, {
    key: "applyMatrix3",
    value: function applyMatrix3(m) {
      var x = this.x,
        y = this.y;
      var e = m.elements;
      this.x = e[0] * x + e[3] * y + e[6];
      this.y = e[1] * x + e[4] * y + e[7];
      return this;
    }
  }, {
    key: "min",
    value: function min(v) {
      this.x = Math.min(this.x, v.x);
      this.y = Math.min(this.y, v.y);
      return this;
    }
  }, {
    key: "max",
    value: function max(v) {
      this.x = Math.max(this.x, v.x);
      this.y = Math.max(this.y, v.y);
      return this;
    }
  }, {
    key: "clamp",
    value: function clamp(min, max) {
      // assumes min < max, componentwise

      this.x = Math.max(min.x, Math.min(max.x, this.x));
      this.y = Math.max(min.y, Math.min(max.y, this.y));
      return this;
    }
  }, {
    key: "clampScalar",
    value: function clampScalar(minVal, maxVal) {
      this.x = Math.max(minVal, Math.min(maxVal, this.x));
      this.y = Math.max(minVal, Math.min(maxVal, this.y));
      return this;
    }
  }, {
    key: "clampLength",
    value: function clampLength(min, max) {
      var length = this.length();
      return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
    }
  }, {
    key: "floor",
    value: function floor() {
      this.x = Math.floor(this.x);
      this.y = Math.floor(this.y);
      return this;
    }
  }, {
    key: "ceil",
    value: function ceil() {
      this.x = Math.ceil(this.x);
      this.y = Math.ceil(this.y);
      return this;
    }
  }, {
    key: "round",
    value: function round() {
      this.x = Math.round(this.x);
      this.y = Math.round(this.y);
      return this;
    }
  }, {
    key: "roundToZero",
    value: function roundToZero() {
      this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
      this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
      return this;
    }
  }, {
    key: "negate",
    value: function negate() {
      this.x = -this.x;
      this.y = -this.y;
      return this;
    }
  }, {
    key: "dot",
    value: function dot(v) {
      return this.x * v.x + this.y * v.y;
    }
  }, {
    key: "cross",
    value: function cross(v) {
      return this.x * v.y - this.y * v.x;
    }
  }, {
    key: "lengthSq",
    value: function lengthSq() {
      return this.x * this.x + this.y * this.y;
    }
  }, {
    key: "length",
    value: function length() {
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }
  }, {
    key: "manhattanLength",
    value: function manhattanLength() {
      return Math.abs(this.x) + Math.abs(this.y);
    }
  }, {
    key: "normalize",
    value: function normalize() {
      return this.divideScalar(this.length() || 1);
    }
  }, {
    key: "angle",
    value: function angle() {
      // computes the angle in radians with respect to the positive x-axis

      var angle = Math.atan2(-this.y, -this.x) + Math.PI;
      return angle;
    }
  }, {
    key: "distanceTo",
    value: function distanceTo(v) {
      return Math.sqrt(this.distanceToSquared(v));
    }
  }, {
    key: "distanceToSquared",
    value: function distanceToSquared(v) {
      var dx = this.x - v.x,
        dy = this.y - v.y;
      return dx * dx + dy * dy;
    }
  }, {
    key: "manhattanDistanceTo",
    value: function manhattanDistanceTo(v) {
      return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
    }
  }, {
    key: "setLength",
    value: function setLength(length) {
      return this.normalize().multiplyScalar(length);
    }
  }, {
    key: "lerp",
    value: function lerp(v, alpha) {
      this.x += (v.x - this.x) * alpha;
      this.y += (v.y - this.y) * alpha;
      return this;
    }
  }, {
    key: "lerpVectors",
    value: function lerpVectors(v1, v2, alpha) {
      this.x = v1.x + (v2.x - v1.x) * alpha;
      this.y = v1.y + (v2.y - v1.y) * alpha;
      return this;
    }
  }, {
    key: "equals",
    value: function equals(v) {
      return v.x === this.x && v.y === this.y;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this.x = array[offset];
      this.y = array[offset + 1];
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      array[offset] = this.x;
      array[offset + 1] = this.y;
      return array;
    }
  }, {
    key: "fromBufferAttribute",
    value: function fromBufferAttribute(attribute, index, offset) {
      if (offset !== undefined) {
        console.warn('THREE.Vector2: offset has been removed from .fromBufferAttribute().');
      }
      this.x = attribute.getX(index);
      this.y = attribute.getY(index);
      return this;
    }
  }, {
    key: "rotateAround",
    value: function rotateAround(center, angle) {
      var c = Math.cos(angle),
        s = Math.sin(angle);
      var x = this.x - center.x;
      var y = this.y - center.y;
      this.x = x * c - y * s + center.x;
      this.y = x * s + y * c + center.y;
      return this;
    }
  }, {
    key: "random",
    value: function random() {
      this.x = Math.random();
      this.y = Math.random();
      return this;
    }
  }, {
    key: _Symbol$iterator,
    value: /*#__PURE__*/_regeneratorRuntime().mark(function value() {
      return _regeneratorRuntime().wrap(function value$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return this.x;
          case 2:
            _context.next = 4;
            return this.y;
          case 4:
          case "end":
            return _context.stop();
        }
      }, value, this);
    })
  }]);
  return Vector2;
}(Symbol.iterator);
exports.Vector2 = Vector2;
Vector2.prototype.isVector2 = true;
},{}],90:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Vector3 = void 0;
var MathUtils = _interopRequireWildcard(require("./MathUtils.js"));
var _Quaternion = require("./Quaternion.js");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || _typeof(obj) !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, catch: function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Vector3 = /*#__PURE__*/function (_Symbol$iterator) {
  function Vector3() {
    var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    _classCallCheck(this, Vector3);
    this.x = x;
    this.y = y;
    this.z = z;
  }
  _createClass(Vector3, [{
    key: "set",
    value: function set(x, y, z) {
      if (z === undefined) z = this.z; // sprite.scale.set(x,y)

      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
  }, {
    key: "setScalar",
    value: function setScalar(scalar) {
      this.x = scalar;
      this.y = scalar;
      this.z = scalar;
      return this;
    }
  }, {
    key: "setX",
    value: function setX(x) {
      this.x = x;
      return this;
    }
  }, {
    key: "setY",
    value: function setY(y) {
      this.y = y;
      return this;
    }
  }, {
    key: "setZ",
    value: function setZ(z) {
      this.z = z;
      return this;
    }
  }, {
    key: "setComponent",
    value: function setComponent(index, value) {
      switch (index) {
        case 0:
          this.x = value;
          break;
        case 1:
          this.y = value;
          break;
        case 2:
          this.z = value;
          break;
        default:
          throw new Error('index is out of range: ' + index);
      }
      return this;
    }
  }, {
    key: "getComponent",
    value: function getComponent(index) {
      switch (index) {
        case 0:
          return this.x;
        case 1:
          return this.y;
        case 2:
          return this.z;
        default:
          throw new Error('index is out of range: ' + index);
      }
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor(this.x, this.y, this.z);
    }
  }, {
    key: "copy",
    value: function copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      return this;
    }
  }, {
    key: "add",
    value: function add(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector3: .add() now only accepts one argument. Use .addVectors( a, b ) instead.');
        return this.addVectors(v, w);
      }
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      return this;
    }
  }, {
    key: "addScalar",
    value: function addScalar(s) {
      this.x += s;
      this.y += s;
      this.z += s;
      return this;
    }
  }, {
    key: "addVectors",
    value: function addVectors(a, b) {
      this.x = a.x + b.x;
      this.y = a.y + b.y;
      this.z = a.z + b.z;
      return this;
    }
  }, {
    key: "addScaledVector",
    value: function addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      return this;
    }
  }, {
    key: "sub",
    value: function sub(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector3: .sub() now only accepts one argument. Use .subVectors( a, b ) instead.');
        return this.subVectors(v, w);
      }
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      return this;
    }
  }, {
    key: "subScalar",
    value: function subScalar(s) {
      this.x -= s;
      this.y -= s;
      this.z -= s;
      return this;
    }
  }, {
    key: "subVectors",
    value: function subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      return this;
    }
  }, {
    key: "multiply",
    value: function multiply(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector3: .multiply() now only accepts one argument. Use .multiplyVectors( a, b ) instead.');
        return this.multiplyVectors(v, w);
      }
      this.x *= v.x;
      this.y *= v.y;
      this.z *= v.z;
      return this;
    }
  }, {
    key: "multiplyScalar",
    value: function multiplyScalar(scalar) {
      this.x *= scalar;
      this.y *= scalar;
      this.z *= scalar;
      return this;
    }
  }, {
    key: "multiplyVectors",
    value: function multiplyVectors(a, b) {
      this.x = a.x * b.x;
      this.y = a.y * b.y;
      this.z = a.z * b.z;
      return this;
    }
  }, {
    key: "applyEuler",
    value: function applyEuler(euler) {
      if (!(euler && euler.isEuler)) {
        console.error('THREE.Vector3: .applyEuler() now expects an Euler rotation rather than a Vector3 and order.');
      }
      return this.applyQuaternion(_quaternion.setFromEuler(euler));
    }
  }, {
    key: "applyAxisAngle",
    value: function applyAxisAngle(axis, angle) {
      return this.applyQuaternion(_quaternion.setFromAxisAngle(axis, angle));
    }
  }, {
    key: "applyMatrix3",
    value: function applyMatrix3(m) {
      var x = this.x,
        y = this.y,
        z = this.z;
      var e = m.elements;
      this.x = e[0] * x + e[3] * y + e[6] * z;
      this.y = e[1] * x + e[4] * y + e[7] * z;
      this.z = e[2] * x + e[5] * y + e[8] * z;
      return this;
    }
  }, {
    key: "applyNormalMatrix",
    value: function applyNormalMatrix(m) {
      return this.applyMatrix3(m).normalize();
    }
  }, {
    key: "applyMatrix4",
    value: function applyMatrix4(m) {
      var x = this.x,
        y = this.y,
        z = this.z;
      var e = m.elements;
      var w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
      this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w;
      this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w;
      this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w;
      return this;
    }
  }, {
    key: "applyQuaternion",
    value: function applyQuaternion(q) {
      var x = this.x,
        y = this.y,
        z = this.z;
      var qx = q.x,
        qy = q.y,
        qz = q.z,
        qw = q.w;

      // calculate quat * vector

      var ix = qw * x + qy * z - qz * y;
      var iy = qw * y + qz * x - qx * z;
      var iz = qw * z + qx * y - qy * x;
      var iw = -qx * x - qy * y - qz * z;

      // calculate result * inverse quat

      this.x = ix * qw + iw * -qx + iy * -qz - iz * -qy;
      this.y = iy * qw + iw * -qy + iz * -qx - ix * -qz;
      this.z = iz * qw + iw * -qz + ix * -qy - iy * -qx;
      return this;
    }
  }, {
    key: "project",
    value: function project(camera) {
      return this.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    }
  }, {
    key: "unproject",
    value: function unproject(camera) {
      return this.applyMatrix4(camera.projectionMatrixInverse).applyMatrix4(camera.matrixWorld);
    }
  }, {
    key: "transformDirection",
    value: function transformDirection(m) {
      // input: THREE.Matrix4 affine matrix
      // vector interpreted as a direction

      var x = this.x,
        y = this.y,
        z = this.z;
      var e = m.elements;
      this.x = e[0] * x + e[4] * y + e[8] * z;
      this.y = e[1] * x + e[5] * y + e[9] * z;
      this.z = e[2] * x + e[6] * y + e[10] * z;
      return this.normalize();
    }
  }, {
    key: "divide",
    value: function divide(v) {
      this.x /= v.x;
      this.y /= v.y;
      this.z /= v.z;
      return this;
    }
  }, {
    key: "divideScalar",
    value: function divideScalar(scalar) {
      return this.multiplyScalar(1 / scalar);
    }
  }, {
    key: "min",
    value: function min(v) {
      this.x = Math.min(this.x, v.x);
      this.y = Math.min(this.y, v.y);
      this.z = Math.min(this.z, v.z);
      return this;
    }
  }, {
    key: "max",
    value: function max(v) {
      this.x = Math.max(this.x, v.x);
      this.y = Math.max(this.y, v.y);
      this.z = Math.max(this.z, v.z);
      return this;
    }
  }, {
    key: "clamp",
    value: function clamp(min, max) {
      // assumes min < max, componentwise

      this.x = Math.max(min.x, Math.min(max.x, this.x));
      this.y = Math.max(min.y, Math.min(max.y, this.y));
      this.z = Math.max(min.z, Math.min(max.z, this.z));
      return this;
    }
  }, {
    key: "clampScalar",
    value: function clampScalar(minVal, maxVal) {
      this.x = Math.max(minVal, Math.min(maxVal, this.x));
      this.y = Math.max(minVal, Math.min(maxVal, this.y));
      this.z = Math.max(minVal, Math.min(maxVal, this.z));
      return this;
    }
  }, {
    key: "clampLength",
    value: function clampLength(min, max) {
      var length = this.length();
      return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
    }
  }, {
    key: "floor",
    value: function floor() {
      this.x = Math.floor(this.x);
      this.y = Math.floor(this.y);
      this.z = Math.floor(this.z);
      return this;
    }
  }, {
    key: "ceil",
    value: function ceil() {
      this.x = Math.ceil(this.x);
      this.y = Math.ceil(this.y);
      this.z = Math.ceil(this.z);
      return this;
    }
  }, {
    key: "round",
    value: function round() {
      this.x = Math.round(this.x);
      this.y = Math.round(this.y);
      this.z = Math.round(this.z);
      return this;
    }
  }, {
    key: "roundToZero",
    value: function roundToZero() {
      this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
      this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
      this.z = this.z < 0 ? Math.ceil(this.z) : Math.floor(this.z);
      return this;
    }
  }, {
    key: "negate",
    value: function negate() {
      this.x = -this.x;
      this.y = -this.y;
      this.z = -this.z;
      return this;
    }
  }, {
    key: "dot",
    value: function dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    }

    // TODO lengthSquared?
  }, {
    key: "lengthSq",
    value: function lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z;
    }
  }, {
    key: "length",
    value: function length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }
  }, {
    key: "manhattanLength",
    value: function manhattanLength() {
      return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
    }
  }, {
    key: "normalize",
    value: function normalize() {
      return this.divideScalar(this.length() || 1);
    }
  }, {
    key: "setLength",
    value: function setLength(length) {
      return this.normalize().multiplyScalar(length);
    }
  }, {
    key: "lerp",
    value: function lerp(v, alpha) {
      this.x += (v.x - this.x) * alpha;
      this.y += (v.y - this.y) * alpha;
      this.z += (v.z - this.z) * alpha;
      return this;
    }
  }, {
    key: "lerpVectors",
    value: function lerpVectors(v1, v2, alpha) {
      this.x = v1.x + (v2.x - v1.x) * alpha;
      this.y = v1.y + (v2.y - v1.y) * alpha;
      this.z = v1.z + (v2.z - v1.z) * alpha;
      return this;
    }
  }, {
    key: "cross",
    value: function cross(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector3: .cross() now only accepts one argument. Use .crossVectors( a, b ) instead.');
        return this.crossVectors(v, w);
      }
      return this.crossVectors(this, v);
    }
  }, {
    key: "crossVectors",
    value: function crossVectors(a, b) {
      var ax = a.x,
        ay = a.y,
        az = a.z;
      var bx = b.x,
        by = b.y,
        bz = b.z;
      this.x = ay * bz - az * by;
      this.y = az * bx - ax * bz;
      this.z = ax * by - ay * bx;
      return this;
    }
  }, {
    key: "projectOnVector",
    value: function projectOnVector(v) {
      var denominator = v.lengthSq();
      if (denominator === 0) return this.set(0, 0, 0);
      var scalar = v.dot(this) / denominator;
      return this.copy(v).multiplyScalar(scalar);
    }
  }, {
    key: "projectOnPlane",
    value: function projectOnPlane(planeNormal) {
      _vector.copy(this).projectOnVector(planeNormal);
      return this.sub(_vector);
    }
  }, {
    key: "reflect",
    value: function reflect(normal) {
      // reflect incident vector off plane orthogonal to normal
      // normal is assumed to have unit length

      return this.sub(_vector.copy(normal).multiplyScalar(2 * this.dot(normal)));
    }
  }, {
    key: "angleTo",
    value: function angleTo(v) {
      var denominator = Math.sqrt(this.lengthSq() * v.lengthSq());
      if (denominator === 0) return Math.PI / 2;
      var theta = this.dot(v) / denominator;

      // clamp, to handle numerical problems

      return Math.acos(MathUtils.clamp(theta, -1, 1));
    }
  }, {
    key: "distanceTo",
    value: function distanceTo(v) {
      return Math.sqrt(this.distanceToSquared(v));
    }
  }, {
    key: "distanceToSquared",
    value: function distanceToSquared(v) {
      var dx = this.x - v.x,
        dy = this.y - v.y,
        dz = this.z - v.z;
      return dx * dx + dy * dy + dz * dz;
    }
  }, {
    key: "manhattanDistanceTo",
    value: function manhattanDistanceTo(v) {
      return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
    }
  }, {
    key: "setFromSpherical",
    value: function setFromSpherical(s) {
      return this.setFromSphericalCoords(s.radius, s.phi, s.theta);
    }
  }, {
    key: "setFromSphericalCoords",
    value: function setFromSphericalCoords(radius, phi, theta) {
      var sinPhiRadius = Math.sin(phi) * radius;
      this.x = sinPhiRadius * Math.sin(theta);
      this.y = Math.cos(phi) * radius;
      this.z = sinPhiRadius * Math.cos(theta);
      return this;
    }
  }, {
    key: "setFromCylindrical",
    value: function setFromCylindrical(c) {
      return this.setFromCylindricalCoords(c.radius, c.theta, c.y);
    }
  }, {
    key: "setFromCylindricalCoords",
    value: function setFromCylindricalCoords(radius, theta, y) {
      this.x = radius * Math.sin(theta);
      this.y = y;
      this.z = radius * Math.cos(theta);
      return this;
    }
  }, {
    key: "setFromMatrixPosition",
    value: function setFromMatrixPosition(m) {
      var e = m.elements;
      this.x = e[12];
      this.y = e[13];
      this.z = e[14];
      return this;
    }
  }, {
    key: "setFromMatrixScale",
    value: function setFromMatrixScale(m) {
      var sx = this.setFromMatrixColumn(m, 0).length();
      var sy = this.setFromMatrixColumn(m, 1).length();
      var sz = this.setFromMatrixColumn(m, 2).length();
      this.x = sx;
      this.y = sy;
      this.z = sz;
      return this;
    }
  }, {
    key: "setFromMatrixColumn",
    value: function setFromMatrixColumn(m, index) {
      return this.fromArray(m.elements, index * 4);
    }
  }, {
    key: "setFromMatrix3Column",
    value: function setFromMatrix3Column(m, index) {
      return this.fromArray(m.elements, index * 3);
    }
  }, {
    key: "setFromEuler",
    value: function setFromEuler(e) {
      this.x = e._x;
      this.y = e._y;
      this.z = e._z;
      return this;
    }
  }, {
    key: "equals",
    value: function equals(v) {
      return v.x === this.x && v.y === this.y && v.z === this.z;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this.x = array[offset];
      this.y = array[offset + 1];
      this.z = array[offset + 2];
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      array[offset] = this.x;
      array[offset + 1] = this.y;
      array[offset + 2] = this.z;
      return array;
    }
  }, {
    key: "fromBufferAttribute",
    value: function fromBufferAttribute(attribute, index, offset) {
      if (offset !== undefined) {
        console.warn('THREE.Vector3: offset has been removed from .fromBufferAttribute().');
      }
      this.x = attribute.getX(index);
      this.y = attribute.getY(index);
      this.z = attribute.getZ(index);
      return this;
    }
  }, {
    key: "random",
    value: function random() {
      this.x = Math.random();
      this.y = Math.random();
      this.z = Math.random();
      return this;
    }
  }, {
    key: "randomDirection",
    value: function randomDirection() {
      // Derived from https://mathworld.wolfram.com/SpherePointPicking.html

      var u = (Math.random() - 0.5) * 2;
      var t = Math.random() * Math.PI * 2;
      var f = Math.sqrt(1 - Math.pow(u, 2));
      this.x = f * Math.cos(t);
      this.y = f * Math.sin(t);
      this.z = u;
      return this;
    }
  }, {
    key: _Symbol$iterator,
    value: /*#__PURE__*/_regeneratorRuntime().mark(function value() {
      return _regeneratorRuntime().wrap(function value$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return this.x;
          case 2:
            _context.next = 4;
            return this.y;
          case 4:
            _context.next = 6;
            return this.z;
          case 6:
          case "end":
            return _context.stop();
        }
      }, value, this);
    })
  }]);
  return Vector3;
}(Symbol.iterator);
exports.Vector3 = Vector3;
Vector3.prototype.isVector3 = true;
var _vector = /*@__PURE__*/new Vector3();
var _quaternion = /*@__PURE__*/new _Quaternion.Quaternion();
},{"./MathUtils.js":84,"./Quaternion.js":87}],91:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Vector4 = void 0;
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, catch: function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var Vector4 = /*#__PURE__*/function (_Symbol$iterator) {
  function Vector4() {
    var x = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
    var y = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
    var z = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 0;
    var w = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 1;
    _classCallCheck(this, Vector4);
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }
  _createClass(Vector4, [{
    key: "width",
    get: function get() {
      return this.z;
    },
    set: function set(value) {
      this.z = value;
    }
  }, {
    key: "height",
    get: function get() {
      return this.w;
    },
    set: function set(value) {
      this.w = value;
    }
  }, {
    key: "set",
    value: function set(x, y, z, w) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.w = w;
      return this;
    }
  }, {
    key: "setScalar",
    value: function setScalar(scalar) {
      this.x = scalar;
      this.y = scalar;
      this.z = scalar;
      this.w = scalar;
      return this;
    }
  }, {
    key: "setX",
    value: function setX(x) {
      this.x = x;
      return this;
    }
  }, {
    key: "setY",
    value: function setY(y) {
      this.y = y;
      return this;
    }
  }, {
    key: "setZ",
    value: function setZ(z) {
      this.z = z;
      return this;
    }
  }, {
    key: "setW",
    value: function setW(w) {
      this.w = w;
      return this;
    }
  }, {
    key: "setComponent",
    value: function setComponent(index, value) {
      switch (index) {
        case 0:
          this.x = value;
          break;
        case 1:
          this.y = value;
          break;
        case 2:
          this.z = value;
          break;
        case 3:
          this.w = value;
          break;
        default:
          throw new Error('index is out of range: ' + index);
      }
      return this;
    }
  }, {
    key: "getComponent",
    value: function getComponent(index) {
      switch (index) {
        case 0:
          return this.x;
        case 1:
          return this.y;
        case 2:
          return this.z;
        case 3:
          return this.w;
        default:
          throw new Error('index is out of range: ' + index);
      }
    }
  }, {
    key: "clone",
    value: function clone() {
      return new this.constructor(this.x, this.y, this.z, this.w);
    }
  }, {
    key: "copy",
    value: function copy(v) {
      this.x = v.x;
      this.y = v.y;
      this.z = v.z;
      this.w = v.w !== undefined ? v.w : 1;
      return this;
    }
  }, {
    key: "add",
    value: function add(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector4: .add() now only accepts one argument. Use .addVectors( a, b ) instead.');
        return this.addVectors(v, w);
      }
      this.x += v.x;
      this.y += v.y;
      this.z += v.z;
      this.w += v.w;
      return this;
    }
  }, {
    key: "addScalar",
    value: function addScalar(s) {
      this.x += s;
      this.y += s;
      this.z += s;
      this.w += s;
      return this;
    }
  }, {
    key: "addVectors",
    value: function addVectors(a, b) {
      this.x = a.x + b.x;
      this.y = a.y + b.y;
      this.z = a.z + b.z;
      this.w = a.w + b.w;
      return this;
    }
  }, {
    key: "addScaledVector",
    value: function addScaledVector(v, s) {
      this.x += v.x * s;
      this.y += v.y * s;
      this.z += v.z * s;
      this.w += v.w * s;
      return this;
    }
  }, {
    key: "sub",
    value: function sub(v, w) {
      if (w !== undefined) {
        console.warn('THREE.Vector4: .sub() now only accepts one argument. Use .subVectors( a, b ) instead.');
        return this.subVectors(v, w);
      }
      this.x -= v.x;
      this.y -= v.y;
      this.z -= v.z;
      this.w -= v.w;
      return this;
    }
  }, {
    key: "subScalar",
    value: function subScalar(s) {
      this.x -= s;
      this.y -= s;
      this.z -= s;
      this.w -= s;
      return this;
    }
  }, {
    key: "subVectors",
    value: function subVectors(a, b) {
      this.x = a.x - b.x;
      this.y = a.y - b.y;
      this.z = a.z - b.z;
      this.w = a.w - b.w;
      return this;
    }
  }, {
    key: "multiply",
    value: function multiply(v) {
      this.x *= v.x;
      this.y *= v.y;
      this.z *= v.z;
      this.w *= v.w;
      return this;
    }
  }, {
    key: "multiplyScalar",
    value: function multiplyScalar(scalar) {
      this.x *= scalar;
      this.y *= scalar;
      this.z *= scalar;
      this.w *= scalar;
      return this;
    }
  }, {
    key: "applyMatrix4",
    value: function applyMatrix4(m) {
      var x = this.x,
        y = this.y,
        z = this.z,
        w = this.w;
      var e = m.elements;
      this.x = e[0] * x + e[4] * y + e[8] * z + e[12] * w;
      this.y = e[1] * x + e[5] * y + e[9] * z + e[13] * w;
      this.z = e[2] * x + e[6] * y + e[10] * z + e[14] * w;
      this.w = e[3] * x + e[7] * y + e[11] * z + e[15] * w;
      return this;
    }
  }, {
    key: "divideScalar",
    value: function divideScalar(scalar) {
      return this.multiplyScalar(1 / scalar);
    }
  }, {
    key: "setAxisAngleFromQuaternion",
    value: function setAxisAngleFromQuaternion(q) {
      // http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToAngle/index.htm

      // q is assumed to be normalized

      this.w = 2 * Math.acos(q.w);
      var s = Math.sqrt(1 - q.w * q.w);
      if (s < 0.0001) {
        this.x = 1;
        this.y = 0;
        this.z = 0;
      } else {
        this.x = q.x / s;
        this.y = q.y / s;
        this.z = q.z / s;
      }
      return this;
    }
  }, {
    key: "setAxisAngleFromRotationMatrix",
    value: function setAxisAngleFromRotationMatrix(m) {
      // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToAngle/index.htm

      // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)

      var angle, x, y, z; // variables for result
      var epsilon = 0.01,
        // margin to allow for rounding errors
        epsilon2 = 0.1,
        // margin to distinguish between 0 and 180 degrees

        te = m.elements,
        m11 = te[0],
        m12 = te[4],
        m13 = te[8],
        m21 = te[1],
        m22 = te[5],
        m23 = te[9],
        m31 = te[2],
        m32 = te[6],
        m33 = te[10];
      if (Math.abs(m12 - m21) < epsilon && Math.abs(m13 - m31) < epsilon && Math.abs(m23 - m32) < epsilon) {
        // singularity found
        // first check for identity matrix which must have +1 for all terms
        // in leading diagonal and zero in other terms

        if (Math.abs(m12 + m21) < epsilon2 && Math.abs(m13 + m31) < epsilon2 && Math.abs(m23 + m32) < epsilon2 && Math.abs(m11 + m22 + m33 - 3) < epsilon2) {
          // this singularity is identity matrix so angle = 0

          this.set(1, 0, 0, 0);
          return this; // zero angle, arbitrary axis
        }

        // otherwise this singularity is angle = 180

        angle = Math.PI;
        var xx = (m11 + 1) / 2;
        var yy = (m22 + 1) / 2;
        var zz = (m33 + 1) / 2;
        var xy = (m12 + m21) / 4;
        var xz = (m13 + m31) / 4;
        var yz = (m23 + m32) / 4;
        if (xx > yy && xx > zz) {
          // m11 is the largest diagonal term

          if (xx < epsilon) {
            x = 0;
            y = 0.707106781;
            z = 0.707106781;
          } else {
            x = Math.sqrt(xx);
            y = xy / x;
            z = xz / x;
          }
        } else if (yy > zz) {
          // m22 is the largest diagonal term

          if (yy < epsilon) {
            x = 0.707106781;
            y = 0;
            z = 0.707106781;
          } else {
            y = Math.sqrt(yy);
            x = xy / y;
            z = yz / y;
          }
        } else {
          // m33 is the largest diagonal term so base result on this

          if (zz < epsilon) {
            x = 0.707106781;
            y = 0.707106781;
            z = 0;
          } else {
            z = Math.sqrt(zz);
            x = xz / z;
            y = yz / z;
          }
        }
        this.set(x, y, z, angle);
        return this; // return 180 deg rotation
      }

      // as we have reached here there are no singularities so we can handle normally

      var s = Math.sqrt((m32 - m23) * (m32 - m23) + (m13 - m31) * (m13 - m31) + (m21 - m12) * (m21 - m12)); // used to normalize

      if (Math.abs(s) < 0.001) s = 1;

      // prevent divide by zero, should not happen if matrix is orthogonal and should be
      // caught by singularity test above, but I've left it in just in case

      this.x = (m32 - m23) / s;
      this.y = (m13 - m31) / s;
      this.z = (m21 - m12) / s;
      this.w = Math.acos((m11 + m22 + m33 - 1) / 2);
      return this;
    }
  }, {
    key: "min",
    value: function min(v) {
      this.x = Math.min(this.x, v.x);
      this.y = Math.min(this.y, v.y);
      this.z = Math.min(this.z, v.z);
      this.w = Math.min(this.w, v.w);
      return this;
    }
  }, {
    key: "max",
    value: function max(v) {
      this.x = Math.max(this.x, v.x);
      this.y = Math.max(this.y, v.y);
      this.z = Math.max(this.z, v.z);
      this.w = Math.max(this.w, v.w);
      return this;
    }
  }, {
    key: "clamp",
    value: function clamp(min, max) {
      // assumes min < max, componentwise

      this.x = Math.max(min.x, Math.min(max.x, this.x));
      this.y = Math.max(min.y, Math.min(max.y, this.y));
      this.z = Math.max(min.z, Math.min(max.z, this.z));
      this.w = Math.max(min.w, Math.min(max.w, this.w));
      return this;
    }
  }, {
    key: "clampScalar",
    value: function clampScalar(minVal, maxVal) {
      this.x = Math.max(minVal, Math.min(maxVal, this.x));
      this.y = Math.max(minVal, Math.min(maxVal, this.y));
      this.z = Math.max(minVal, Math.min(maxVal, this.z));
      this.w = Math.max(minVal, Math.min(maxVal, this.w));
      return this;
    }
  }, {
    key: "clampLength",
    value: function clampLength(min, max) {
      var length = this.length();
      return this.divideScalar(length || 1).multiplyScalar(Math.max(min, Math.min(max, length)));
    }
  }, {
    key: "floor",
    value: function floor() {
      this.x = Math.floor(this.x);
      this.y = Math.floor(this.y);
      this.z = Math.floor(this.z);
      this.w = Math.floor(this.w);
      return this;
    }
  }, {
    key: "ceil",
    value: function ceil() {
      this.x = Math.ceil(this.x);
      this.y = Math.ceil(this.y);
      this.z = Math.ceil(this.z);
      this.w = Math.ceil(this.w);
      return this;
    }
  }, {
    key: "round",
    value: function round() {
      this.x = Math.round(this.x);
      this.y = Math.round(this.y);
      this.z = Math.round(this.z);
      this.w = Math.round(this.w);
      return this;
    }
  }, {
    key: "roundToZero",
    value: function roundToZero() {
      this.x = this.x < 0 ? Math.ceil(this.x) : Math.floor(this.x);
      this.y = this.y < 0 ? Math.ceil(this.y) : Math.floor(this.y);
      this.z = this.z < 0 ? Math.ceil(this.z) : Math.floor(this.z);
      this.w = this.w < 0 ? Math.ceil(this.w) : Math.floor(this.w);
      return this;
    }
  }, {
    key: "negate",
    value: function negate() {
      this.x = -this.x;
      this.y = -this.y;
      this.z = -this.z;
      this.w = -this.w;
      return this;
    }
  }, {
    key: "dot",
    value: function dot(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z + this.w * v.w;
    }
  }, {
    key: "lengthSq",
    value: function lengthSq() {
      return this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w;
    }
  }, {
    key: "length",
    value: function length() {
      return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    }
  }, {
    key: "manhattanLength",
    value: function manhattanLength() {
      return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w);
    }
  }, {
    key: "normalize",
    value: function normalize() {
      return this.divideScalar(this.length() || 1);
    }
  }, {
    key: "setLength",
    value: function setLength(length) {
      return this.normalize().multiplyScalar(length);
    }
  }, {
    key: "lerp",
    value: function lerp(v, alpha) {
      this.x += (v.x - this.x) * alpha;
      this.y += (v.y - this.y) * alpha;
      this.z += (v.z - this.z) * alpha;
      this.w += (v.w - this.w) * alpha;
      return this;
    }
  }, {
    key: "lerpVectors",
    value: function lerpVectors(v1, v2, alpha) {
      this.x = v1.x + (v2.x - v1.x) * alpha;
      this.y = v1.y + (v2.y - v1.y) * alpha;
      this.z = v1.z + (v2.z - v1.z) * alpha;
      this.w = v1.w + (v2.w - v1.w) * alpha;
      return this;
    }
  }, {
    key: "equals",
    value: function equals(v) {
      return v.x === this.x && v.y === this.y && v.z === this.z && v.w === this.w;
    }
  }, {
    key: "fromArray",
    value: function fromArray(array) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      this.x = array[offset];
      this.y = array[offset + 1];
      this.z = array[offset + 2];
      this.w = array[offset + 3];
      return this;
    }
  }, {
    key: "toArray",
    value: function toArray() {
      var array = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      array[offset] = this.x;
      array[offset + 1] = this.y;
      array[offset + 2] = this.z;
      array[offset + 3] = this.w;
      return array;
    }
  }, {
    key: "fromBufferAttribute",
    value: function fromBufferAttribute(attribute, index, offset) {
      if (offset !== undefined) {
        console.warn('THREE.Vector4: offset has been removed from .fromBufferAttribute().');
      }
      this.x = attribute.getX(index);
      this.y = attribute.getY(index);
      this.z = attribute.getZ(index);
      this.w = attribute.getW(index);
      return this;
    }
  }, {
    key: "random",
    value: function random() {
      this.x = Math.random();
      this.y = Math.random();
      this.z = Math.random();
      this.w = Math.random();
      return this;
    }
  }, {
    key: _Symbol$iterator,
    value: /*#__PURE__*/_regeneratorRuntime().mark(function value() {
      return _regeneratorRuntime().wrap(function value$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            _context.next = 2;
            return this.x;
          case 2:
            _context.next = 4;
            return this.y;
          case 4:
            _context.next = 6;
            return this.z;
          case 6:
            _context.next = 8;
            return this.w;
          case 8:
          case "end":
            return _context.stop();
        }
      }, value, this);
    })
  }]);
  return Vector4;
}(Symbol.iterator);
exports.Vector4 = Vector4;
Vector4.prototype.isVector4 = true;
},{}],92:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.arrayMax = arrayMax;
exports.arrayMin = arrayMin;
exports.arrayNeedsUint32 = arrayNeedsUint32;
exports.createElementNS = createElementNS;
exports.getTypedArray = getTypedArray;
function arrayMin(array) {
  if (array.length === 0) return Infinity;
  var min = array[0];
  for (var i = 1, l = array.length; i < l; ++i) {
    if (array[i] < min) min = array[i];
  }
  return min;
}
function arrayMax(array) {
  if (array.length === 0) return -Infinity;
  var max = array[0];
  for (var i = 1, l = array.length; i < l; ++i) {
    if (array[i] > max) max = array[i];
  }
  return max;
}
function arrayNeedsUint32(array) {
  // assumes larger values usually on last

  for (var i = array.length - 1; i >= 0; --i) {
    if (array[i] > 65535) return true;
  }
  return false;
}
var TYPED_ARRAYS = {
  Int8Array: Int8Array,
  Uint8Array: Uint8Array,
  Uint8ClampedArray: Uint8ClampedArray,
  Int16Array: Int16Array,
  Uint16Array: Uint16Array,
  Int32Array: Int32Array,
  Uint32Array: Uint32Array,
  Float32Array: Float32Array,
  Float64Array: Float64Array
};
function getTypedArray(type, buffer) {
  return new TYPED_ARRAYS[type](buffer);
}
function createElementNS(name) {
  return document.createElementNS('http://www.w3.org/1999/xhtml', name);
}
},{}],93:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

window.RSBase = angular.module('RSBase', ['ui.router', 'ngSanitize']).provider("RSRegistry", [function () {
  var globalSettingsRegistry = [];
  var userSettingsRegistry = [];
  return {
    registerGlobalSettingsDialog: function registerGlobalSettingsDialog(name, state, icon, feature) {
      globalSettingsRegistry.push({
        name: name,
        state: state,
        icon: icon,
        feature: feature
      });
    },
    $get: function $get() {
      return {
        globalSettingsDialogs: globalSettingsRegistry,
        userSettingsDialogs: userSettingsRegistry
      };
    }
  };
}]).config(['$stateProvider', '$qProvider', function ($stateProvider, $qProvider) {
  $qProvider.errorOnUnhandledRejections(false);
}]);
function equalHeight() {
  $('.equalheight').each(function () {
    var maxHeight = 0;
    $(this).children().each(function () {
      if ($(this).height() > maxHeight) maxHeight = $(this).height();
    });
    $(this).children().height(maxHeight);
  });
}
$(window).on("load", equalHeight);
$(window).on("resize", equalHeight);
},{}],94:[function(require,module,exports){
"use strict";

var _Helper3D = require("../slicer/Helper3D");
var _RSUtils = require("./RSUtils.js");
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, catch: function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _createForOfIteratorHelper(o, allowArrayLike) { var it = typeof Symbol !== "undefined" && o[Symbol.iterator] || o["@@iterator"]; if (!it) { if (Array.isArray(o) || (it = _unsupportedIterableToArray(o)) || allowArrayLike && o && typeof o.length === "number") { if (it) o = it; var i = 0; var F = function F() {}; return { s: F, n: function n() { if (i >= o.length) return { done: true }; return { done: false, value: o[i++] }; }, e: function e(_e) { throw _e; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var normalCompletion = true, didErr = false, err; return { s: function s() { it = it.call(o); }, n: function n() { var step = it.next(); normalCompletion = step.done; return step; }, e: function e(_e2) { didErr = true; err = _e2; }, f: function f() { try { if (!normalCompletion && it.return != null) it.return(); } finally { if (didErr) throw err; } } }; }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

var axios = require("axios");
/**
 * Created by littwin on 31.08.14.
 */
// Dummy variable to resolve unused variables for unknown json data
//noinspection JSUnusedLocalSymbols
var dummy = {
  msgType: 0,
  urgency: undefined,
  doorHandling: undefined,
  permissionDenied: undefined,
  mozRequestFullScreen: undefined,
  msRequestFullscreen: undefined,
  webkitRequestFullscreen: undefined
};
RSBase.factory('RSCom', ['$q', '$rootScope', 'User', '$location', '$uibModal', '$http', '$templateCache', 'localStorageService', '$timeout', 'Flash', 'Confirm', function ($q, $rootScope, User, $location, $uibModal, $http, $templateCache, localStorageService, $timeout, Flash, Confirm) {
  // noinspection JSDeprecatedSymbols
  $rootScope.mobile = typeof window.orientation !== 'undefined' || navigator.userAgent.indexOf('IEMobile') !== -1;
  $rootScope.isWebGL2Supported = _Helper3D.helper3D.isWebGL2Supported;
  $rootScope.isMobile = _RSUtils.isMobile;
  // We return this object to anything injecting our service
  var Service = {};
  // Keep all pending requests here until they get responses
  var callbacks = {};
  // Create a unique callback ID to map requests to responses
  var currentCallbackId = 0;
  // Create our websocket object with the address to the websocket
  var ws = null;
  var connectCount = 0;
  Service.connected = false;
  Service.wasConnected = false;
  $rootScope.alert = false;
  var deflist = [];
  var printerSlug = '';
  var conDialog = null;
  var openPings = 0;
  var firstConnection = true;
  var nextTimeout = 50;
  var startVersion = '';
  var ignoreErrorsTil = -1;
  $rootScope.hardwareInfo = {
    maxUrgency: -1,
    list: []
  };
  Service.isSecure = function () {
    return window.location.protocol === 'https:';
  };
  if (Service.isSecure()) $rootScope.httpType = 'https';else $rootScope.httpType = 'http';
  $rootScope.update = {
    features: 0
  };
  window.rs = $rootScope; // for debugging
  $rootScope.hasFeature = function (f) {
    return (f & $rootScope.update.features) === f;
  };
  $rootScope.toClipboard = function (text) {
    var inp = document.createElement("textarea");
    inp.style.position = 'fixed';
    inp.style.top = '0';
    inp.style.left = '0';
    inp.style.width = '1px';
    inp.style.height = '1px';
    inp.style.padding = '0';
    inp.style.border = 'none';
    inp.style.outline = 'none';
    inp.style.boxShadow = 'none';
    inp.style.background = 'transparent';
    inp.value = text;
    document.body.appendChild(inp);
    inp.focus();
    inp.select();
    try {
      document.execCommand('copy');
      Flash.success("<?php _('Text copied') ?>");
    } catch (err) {}
    document.body.removeChild(inp);
  };
  $rootScope.isOEM = function () {
    return $rootScope.hasFeature(32768);
  };
  $rootScope.isPro = function () {
    return $rootScope.hasFeature(2048);
  };
  $rootScope.hasFeature1 = false;
  // preload modal helper in case we are offline, we need this for message
  $http.get('uib/template/modal/backdrop.html', {
    cache: $templateCache
  });
  $http.get('uib/template/modal/window.html', {
    cache: $templateCache
  });
  $http.get('/views/base/connectionLost.php?lang=' + window.lang, {
    cache: $templateCache
  });
  Service.updateImportant = function () {
    Service.send('updateAvailable', {}).then(function (r) {
      $rootScope.update = r;
      if (r.currentVersion !== startVersion) {
        if (startVersion !== '') {
          // noinspection JSDeprecatedSymbols
          location.reload(true);
        }
        startVersion = r.currentVersion;
      }
      $rootScope.hasFeature1 = $rootScope.hasFeature(1);
      $rootScope.hasWebcamSupport = $rootScope.hasFeature(4);
      $rootScope.hasLocalCloud = $rootScope.hasFeature(32);
      $rootScope.hasFirmwareUpload = $rootScope.hasFeature(256);
      $rootScope.$broadcast('newUpdateLoaded', r);
    }, function () {});
  };
  $rootScope.globalErrorsVisible = [];
  $rootScope.fetchGlobalErrors = function () {
    Service.send('getGlobalErrors', {}).then(function (r) {
      angular.forEach(r.errors, function (err) {
        if (!$rootScope.globalErrorsVisible.find(function (error) {
          return error === err.id;
        })) {
          $rootScope.globalErrorsVisible.push(err.id);
          console.log("errors visible before confirm", $rootScope.globalErrorsVisible);
          Confirm(err.data.headline, err.data.text, "<?php _('Confirm') ?>", "", true, "", true).then(function () {
            Service.send('removeGlobalError', {
              id: err.id
            }).then(function (r) {
              var index = $rootScope.globalErrorsVisible.indexOf(err.id);
              if (index > -1) {
                $rootScope.globalErrorsVisible.splice(index, 1);
                console.log("errors visible after confirm", $rootScope.globalErrorsVisible);
              }
            });
          });
        } else {
          console.log("error id: ", err.id, "already open");
        }
      });
    });
  };
  $rootScope.$on('globalErrorsChanged', function () {
    $rootScope.fetchGlobalErrors();
  });
  $rootScope.$on('licenceChanged', function () {
    Service.updateImportant();
  });
  var icons = ['rs-fw rs-bigtab',
  // None
  'fa fa-bolt rs-fw rs-bigtab',
  // Bolt
  'fa fa-thermometer-half rs-fw rs-bigtab',
  // Temperature
  'fa fa-exclamation-triangle rs-fw rs-bigtab', 'fa fa-battery-full rs-fw rs-bigtab',
  // Battery
  'fa fa-bug rs-fw rs-bigtab',
  // Bug
  'fa fa-plug rs-fw rs-bigtab',
  // Plug
  'fa fa-usb rs-fw rs-bigtab',
  //Usb logo
  'rs rs-webcam rs-fw rs-bigtab',
  // Camera
  'fa fa-tasks rs-fw rs-bigtab',
  // 9: Tasks
  'fa fa-bell rs-fw rs-bigtab',
  // Bell
  'fa fa-bluetooth rs-fw rs-bigtab',
  // 11: Bluetooth
  'fa fa-square-o rs-fw rs-bigtab',
  // 12: Square
  'fa fa-check-square-o rs-fw rs-bigtab',
  // 13: Checked Square
  'fa fa-hdd-o rs-fw rs-bigtab',
  // 14: HDD
  'fa fa-hourglass rs-fw rs-bigtab',
  //15: Hourglass
  'fa fa-wifi rs-fw rs-bigtab',
  // 16: wifi
  'fa fa-microchip rs-fw rs-bigtab',
  // 17: Microchip,
  'fa fa-clock-o rs-fw rs-bigtab' // 18 Clock
  ];

  $rootScope.autoupdateRunning = false;
  $rootScope.$on('autoupdateStarted', function () {
    $rootScope.autoupdateRunning = true;
  });
  $rootScope.$on('hardwareInfo', function (event, data) {
    $rootScope.hardwareInfo = data.data;
    switch ($rootScope.hardwareInfo.maxUrgency) {
      case 0:
      case 1:
        $rootScope.hardwareInfo.boltClass = 'fa fa-bolt';
        break;
      case 2:
        $rootScope.hardwareInfo.boltClass = 'fa fa-bolt text-warning-light';
        break;
      case 3:
        $rootScope.hardwareInfo.boltClass = 'fa fa-bolt text-danger-light';
        break;
    }
    angular.forEach($rootScope.hardwareInfo.list, function (hi) {
      var extra = hi.url ? ' &nbsp; <i class="fa fa-external-link"></i>' : '';
      // 0 = text, 1 = int value, 2 = 1 digit info, 3 = 2 digit info, 10 = splitter, 11 = Block Headline
      switch (hi.msgType) {
        case 0:
          hi.content = hi.name + ' ' + hi.text + extra;
          break;
        case 1:
          hi.content = hi.name + ' ' + parseInt(hi.value) + ' ' + hi.unit + extra;
          break;
        case 2:
          hi.content = hi.name + ' ' + parseFloat(hi.value).toFixed(1) + ' ' + hi.unit + extra;
          break;
        case 3:
          hi.content = hi.name + ' ' + parseFloat(hi.value).toFixed(1) + ' ' + hi.unit + extra;
          break;
      }
      hi.iconClass = icons[hi.icon];
      if (hi.urgency === 2) {
        hi.iconClass += ' text-warning-light';
      }
      if (hi.urgency === 3) {
        hi.iconClass += ' text-danger-light';
      }
    });
  });
  var startConnection = function startConnection() {
    if (ws !== null && ws.readyState === 1) return;
    if (typeof document.hidden !== 'undefined' && document.hidden) {
      setTimeout(startConnection, 50);
      return;
    }
    connectCount++;
    if (connectCount > 20) {
      connectCount = 0;
      console.clear();
    }
    var auth = localStorageService.get('session');
    if (window.URL) {
      var url_string = window.location.href;
      var url = new URL(url_string);
      if (url.searchParams.has('sess')) {
        var sess = url.searchParams.get('sess');
        auth = {
          session: sess
        };
      }
    }
    var extra = '';
    ignoreErrorsTil = -1; // reset error handling and callbacks
    //callbacks = {};

    if (window.frontEnd) {
      extra += '&front=1';
    }
    if (auth && auth.session) {
      extra += '&sess=' + encodeURIComponent(auth.session);
    }
    //console.log("opening socket");
    try {
      ws = new WebSocket((Service.isSecure() ? 'wss://' : 'ws://') + window.location.host + '/socket/?lang=' + window.lang + extra);
      ws.onopen = function () {
        if ($rootScope.autoupdateRunning) {
          // noinspection JSDeprecatedSymbols
          location.reload(true);
        }
        $rootScope.autoupdateRunning = false;
        Service.connected = true;
        openPings = 0;
        if (conDialog) {
          conDialog.close();
        }
        conDialog = null;
        Service.updateImportant();
        var oldCallbacks = [];
        angular.forEach(callbacks, function (cb) {
          oldCallbacks.push(cb);
        });
        $rootScope.$broadcast('connected');
        var tryFlush = function tryFlush() {
          if (ws.readyState !== 1) {
            if (ws.readyState < 1) {
              $timeout(tryFlush, 20);
            }
            //$timeout(startConnection,20);
            return;
          }
          firstConnection = false;
          //console.log("flush commands");
          $.each(deflist, function (idx, val) {
            val.resolve(ws);
          });
          deflist = [];
          nextTimeout = 50;
          Service.wasConnected = true;
        };
        // all commands are unanswered and need to be resend once connection is established
        angular.forEach(oldCallbacks, function (cb) {
          var d = $q.defer();
          deflist.push(d);
          d.promise.then(function () {
            cb.request.session = User.getSession();
            if (!cb.request.ws || cb.request.ws !== ws) {
              delete cb.request.ws;
              ws.send(angular.toJson(cb.request));
              cb.request.ws = ws;
            }
          }, function () {});
        });
        $timeout(tryFlush, 10);
        $rootScope.$apply();
      };
      ws.onerror = function (message) {
        // console.log("websocket error", message);
      };
      ws.onclose = function () {
        // console.log("close socket");
        if (Service.connected) {
          Service.connected = false;
          $rootScope.$broadcast('disconnected');
          if (conDialog === null && !firstConnection) {
            conDialog = $uibModal.open({
              templateUrl: '/views/base/connectionLost.php?lang=' + window.lang,
              keyboard: false,
              size: 'lg',
              backdrop: 'static'
            });
            conDialog.result.catch(function (res) {});
          }
        }
        setTimeout(startConnection, nextTimeout);
        if (nextTimeout < 1000) nextTimeout = 2 * nextTimeout;else nextTimeout = 2000;
      };
      ws.onmessage = function (message) {
        $rootScope.timeMS = new Date().getTime();
        try {
          //console.log("Got:",message.data);  // DEBUG_SOCKET
          listener(angular.fromJson(message.data));
        } catch (error) {
          console.log('websocket listener');
          console.log(error);
          console.log(message);
        }
      };
    } catch (error) {
      console.log('connection error', error);
    }
  };
  $(window).unload(function () {
    if (ws) {
      ws.onclose = function () {};
      ws.close();
    }
  });
  $rootScope.forceLogin = function () {
    if ($location.path() !== '/login') $rootScope.pathAfterLogin = $location.path();else $rootScope.pathAfterLogin = '/';
    if (User.autologin(Service)) return;
    User.logout();
    /* $rootScope.$apply(function () {
      $location.path('/login')
    }) */
  };

  window.loc = $location;
  $rootScope.$on('loginRequired', $rootScope.forceLogin);
  startConnection();
  function sendRequest(request) {
    var defer = $q.defer();
    request.callback_id = getCallbackId();
    if (request.action === 'login') {
      ignoreErrorsTil = request.callback_id;
    }
    callbacks[request.callback_id] = {
      time: new Date(),
      cb: defer,
      request: request
    };
    if (!Service.connected || ws && ws.readyState !== 1) {
      // buffer commands until connection is open
      var d = $q.defer();
      deflist.push(d);
      d.promise.then(function () {
        request.session = User.getSession();
        if (!request.ws || request.ws !== ws) {
          delete request.ws;
          ws.send(angular.toJson(request));
          request.ws = ws;
        }
      }, function () {});
    } else {
      //console.log("Send:",angular.toJson(request)); // DEBUG_SOCKET
      ws.send(angular.toJson(request));
      request.ws = ws;
    }
    return defer.promise;
  }
  function listener(data) {
    var messageObj = data;
    if (typeof messageObj.session != 'undefined' && User.getSession() !== messageObj.session) {
      User.setSession(messageObj.session);
    }
    // If an object exists with callback_id in our callbacks object, resolve it
    if (messageObj.callback_id < 0) {
      // event
      angular.forEach(messageObj.data, function (evt) {
        // console.log('bradcast', evt.event)
        $rootScope.$broadcast(evt.event, evt);
        $rootScope.$apply();
        if (evt.event === 'pong') {
          Service.send('ping', {
            source: 'gui-Pong'
          });
        }
      });
    } else if (callbacks[messageObj.callback_id]) {
      var cb = callbacks[messageObj.callback_id];
      if (ignoreErrorsTil < 0 && ignoreErrorsTil > messageObj.callback_id) ignoreErrorsTil = -1;
      if (typeof messageObj.data.permissionDenied !== 'undefined') {
        if (ignoreErrorsTil >= 0 && messageObj.callback_id < ignoreErrorsTil) {
          cb.cb.reject();
          delete callbacks[messageObj.callback_id];
        } else {
          cb.cb.reject();
          delete callbacks[messageObj.callback_id];
          $rootScope.forceLogin();
        }
        return;
      } else if (typeof messageObj.data.alert != 'undefined') {
        cb.cb.reject();
        delete callbacks[messageObj.callback_id];
        $rootScope.alert = messageObj.data.alert;
        return;
      }
      $rootScope.$apply(cb.cb.resolve(messageObj.data));
      delete callbacks[messageObj.callback_id];
    }
  }

  // This creates a new callback ID for a request
  function getCallbackId() {
    currentCallbackId += 1;
    if (currentCallbackId > 10000) {
      currentCallbackId = 0;
    }
    return currentCallbackId;
  }
  Service.uploadFiles = /*#__PURE__*/function () {
    var _ref2 = _asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee(_ref, _onUploadProgress) {
      var url, a, files, group, autostart, uploadStart, uploadWeight, config, sumSize, _iterator, _step, file, upload, _iterator2, _step2, _file, answer, answerObj;
      return _regeneratorRuntime().wrap(function _callee$(_context) {
        while (1) switch (_context.prev = _context.next) {
          case 0:
            url = _ref.url, a = _ref.a, files = _ref.files, group = _ref.group, autostart = _ref.autostart;
            uploadStart = 0;
            uploadWeight = 1;
            config = {
              onUploadProgress: function onUploadProgress(progressEvent) {
                var percent = Math.round(uploadStart + uploadWeight * progressEvent.loaded / progressEvent.total * 100);
                //console.log("progress ", percent)
                _onUploadProgress(percent);
              },
              headers: {
                "Content-Type": "multipart/form-data"
              },
              maxContentLength: Infinity,
              maxBodyLength: Infinity
            };
            sumSize = 0;
            _iterator = _createForOfIteratorHelper(files);
            try {
              for (_iterator.s(); !(_step = _iterator.n()).done;) {
                file = _step.value;
                sumSize += file.filename.size;
              }
            } catch (err) {
              _iterator.e(err);
            } finally {
              _iterator.f();
            }
            upload = function upload(name, filename) {
              var fd = new FormData();
              fd.append("a", a);
              fd.append("sess", User.getSession());
              fd.append("name", name);
              fd.append("filename", filename);
              if (group) {
                fd.append("group", group);
              }
              if (autostart) {
                fd.append("autostart", autostart);
              }
              return axios.post(url, fd, config);
            };
            Service.extendPing(300); // 5 minutes before we time out
            _iterator2 = _createForOfIteratorHelper(files);
            _context.prev = 10;
            _iterator2.s();
          case 12:
            if ((_step2 = _iterator2.n()).done) {
              _context.next = 23;
              break;
            }
            _file = _step2.value;
            // console.log("uploading: ", file)
            uploadWeight = _file.filename.size / sumSize;
            _context.next = 17;
            return upload(_file.name, _file.filename);
          case 17:
            answer = _context.sent;
            uploadStart += 100 * uploadWeight;
            answerObj = _typeof(answer.data) === "object" ? answer : JSON.parse(answer.data);
            if (answerObj.error === undefined) {
              //Flash.success("<?php _('Upload finished') ?>")
            } else {
              Flash.error("<?php _('Upload failed') ?>" + ": " + answerObj.error);
            }
            //console.log("uploading finished: ", file)
          case 21:
            _context.next = 12;
            break;
          case 23:
            _context.next = 28;
            break;
          case 25:
            _context.prev = 25;
            _context.t0 = _context["catch"](10);
            _iterator2.e(_context.t0);
          case 28:
            _context.prev = 28;
            _iterator2.f();
            return _context.finish(28);
          case 31:
            Service.extendPing(0); // Reset default timeout
          case 32:
          case "end":
            return _context.stop();
        }
      }, _callee, null, [[10, 25, 28, 31]]);
    }));
    return function (_x, _x2) {
      return _ref2.apply(this, arguments);
    };
  }();
  Service.send = function (command, data, slug) {
    if (!slug) slug = printerSlug;
    if (!data) data = {};
    return sendRequest({
      action: command,
      data: data,
      printer: slug
    });
  };
  Service.selectPrinter = function (slug) {
    printerSlug = slug;
    Service.send('activePrinter', {
      printer: slug
    }, slug);
  };
  Service.extendPing = function (timeout) {
    Service.send('extendPing', {
      timeout: timeout
    }); /* .then(function() {
        console.log('timeout now ' + timeout + ' seconds')
        });*/
  };

  $rootScope.RSCom = Service;
  var lastHidden = false;
  var ping = function ping() {
    if (Service.connected) {
      if (openPings > 10) ws.close();else {
        // Adjust timeout to prevent loosing connection on inactive tabs
        if (typeof document.hidden !== 'undefined') {
          if (lastHidden !== document.hidden) {
            // console.log('request timeout now ' + (document.hidden ? 300 : 0) + ' seconds')
            Service.extendPing(document.hidden ? 300 : 0);
            lastHidden = document.hidden;
          }
        }
        openPings++;
        Service.send('ping', {
          source: 'gui'
        }).then(function () {
          openPings--;
        }, function () {}); // we are still alive!
      }
    }

    $timeout(ping, 2000);
  };
  ping();
  $rootScope.fetchGlobalErrors();
  return Service;
}]).factory('RSOverview', ['$rootScope', 'RSCom', '$timeout', '$compile', '$q', 'Confirm', '$filter', 'User', '$state', 'Flash', function ($rootScope, RSCom, $timeout, $compile, $q, Confirm, $filter, User, $state, Flash) {
  $rootScope.externalCommands = [];
  $rootScope.externalLinks = [];
  $rootScope.loading = false;
  $rootScope.printerList = []; // short printer state online/job/..
  $rootScope.printerListActive = []; // short printer state online/job/..
  $rootScope.printerListInactive = []; // short printer state online/job/..
  $rootScope.printerStateList = {}; // State of all online printer
  $rootScope.active = {
    status: {}
  }; // reference on printer[activeSlug]
  $rootScope.activeConfig = {}; // reference to printerConfig[activeSlug]
  $rootScope.activeSlug = ''; // slug of currently selected printer
  $rootScope.serverSetup = {};
  $rootScope.printerConfig = {}; // Configuration of all printers
  $rootScope.printer = {};
  $rootScope.serverSettings = {}; // global server settings
  $rootScope.printerWithJobs = [];
  $rootScope.folders = [];
  $rootScope.dispatcherOpen = 0;
  $rootScope.manufacturerNews = [];
  $rootScope.newManufacturerNews = false;
  var firstPrinterPoll = true;
  var firstStatePoll = true;
  var pollerPromise = null;
  var statePollerPromise = null;

  // Little loader indicator
  var basicHtml = '<div class="loading" ng-show="loading"><i class="icon-spin icon-spinner"></i> Loading ...</div>';
  var basicHtmlElement = angular.element(basicHtml);
  $compile(basicHtmlElement)($rootScope);
  // noinspection JSCheckFunctionSignatures
  angular.element(document.body).append(basicHtmlElement);
  $rootScope.$on('load', function () {
    $rootScope.loading = true;
  });
  $rootScope.$on('loaded', function () {
    $rootScope.loading = false;
  });
  var updateFolders = function updateFolders() {
    RSCom.send('getFolders', {}).then(function (data) {
      $rootScope.folders = data.folders;
    });
  };
  var updateManufacturerNews = function updateManufacturerNews() {
    RSCom.send('getManufacturerNews', {}).then(function (data) {
      if (data.ok) {
        $rootScope.manufacturerNews = data.messages;
        $rootScope.manufacturerNewsTitle = data.title;
        $rootScope.newManufacturerNews = data.newMessages;
        $rootScope.$broadcast('manufacturerNewsUpdated');
      }
    });
  };
  $rootScope.$on('manufacturerNewsChanged', updateManufacturerNews);
  var updateDialogs = function updateDialogs() {
    angular.forEach($rootScope.printer, function (p, idx) {
      RSCom.send('getDialogs', {
        lang: lang
      }, idx).then(function (data) {
        p.dialogs = data.dialogs;
      });
    });
  };
  $rootScope.$on('dialogsChanged', function (event, data) {
    RSCom.send('getDialogs', {
      lang: lang
    }, data.printer).then(function (data2) {
      $rootScope.printer[data.printer].dialogs = data2.dialogs;
    });
  });
  $rootScope.$on('dispatcherCount', function (event, n) {
    $rootScope.dispatcherOpen = n.data.count;
  });
  $rootScope.$on('foldersChanged', updateFolders);
  var updateAllRecover = function updateAllRecover() {
    angular.forEach($rootScope.printer, function (p, idx) {
      RSCom.send('getRecover', {}, idx).then(function (data) {
        p.recover = data.recover;
      });
    });
  };
  // Updates printer list very 20 seconds in case some state change did not get an event
  var hasPrinterListPromise = $q.defer();
  var parsePrinterStatus = function parsePrinterStatus(p) {
    if (!$rootScope.printer[p.slug]) {
      // new printer
      $rootScope.printer[p.slug] = {
        status: p,
        state: {},
        log: [],
        history: [],
        layer: [],
        dialogs: [],
        previousLayer: [],
        recover: {
          state: -1
        },
        local: {},
        reconnectCounter: 0
      };
      RSCom.send('getDialogs', {
        lang: lang
      }, p.slug).then(function (data2) {
        $rootScope.printer[p.slug].dialogs = data2.dialogs;
      });
    } else {
      $rootScope.printer[p.slug].status = p;
    }
    //$rootScope.printer[p.slug].state.isJobActive = p.job !== 'none'

    //if ($rootScope.printer[p.slug].state.isJobActive){
    $rootScope.printer[p.slug].state.isJobActive = p.jobstate === "running";
    //}
    if (p.slug === $rootScope.activeSlug) {
      $rootScope.active = $rootScope.printer[p.slug];
    }
    if (p.done) $rootScope.printerWithJobs.push(p);
  };
  //$rootScope.printerList = [];
  var lastPollerSet = '';
  var lastOrder = '';
  var parsePrinterList = function parsePrinterList(r) {
    var newPollerString = angular.toJson(r);
    var order = User.getSetting('printerOrder', 'dynamic');
    if (lastPollerSet !== newPollerString || lastOrder !== order) {
      lastPollerSet = newPollerString;
      lastOrder = order;
      if (order === 'name') {
        $rootScope.printerList = $filter('orderBy')(r, ['name']); //r;
      } else {
        $rootScope.printerList = $filter('orderBy')(r, ['-online', '-active', 'name']); //r;
      }

      $rootScope.printerListActive = $filter('filter')($rootScope.printerList, {
        active: true
      });
      $rootScope.printerListInactive = $filter('filter')($rootScope.printerList, {
        active: false
      });
      $rootScope.printerWithJobs = [];
      var openCount = r.length;
      $rootScope.stateTime = new Date().getTime(); // Time of last state change
      angular.forEach(r, function (p) {
        parsePrinterStatus(p);
        if (firstPrinterPoll || typeof $rootScope.printerConfig[p.slug] == 'undefined') {
          openCount++;
          RSCom.send('getPrinterConfig', {
            printer: p.slug
          }).then(function (c) {
            if (Object.entries(c).length) {
              c.isZBelt = c.shape.basicShape.shape === 'zbelt';
              $rootScope.printerConfig[p.slug] = c;
              if ($rootScope.printer[p.slug] && $rootScope.printer[p.slug].local.showAbsolutePositions === undefined) {
                $rootScope.printer[p.slug].local.showAbsolutePositions = c.movement.startWithAbsolutePositions;
              }
              $rootScope.activeConfig = $rootScope.printerConfig[$rootScope.activeSlug];
              openCount--;
              if (firstPrinterPoll && openCount === 0) {
                firstPrinterPoll = false;
                hasPrinterListPromise.resolve();
                updateAllRecover();
              }
              $rootScope.$broadcast('loadedPrinterConfig', p.slug);
            } else {
              delete $rootScope.printer[p.slug];
            }
          });
        }
        openCount--;
      });
      if (firstPrinterPoll && openCount === 0) {
        firstPrinterPoll = false;
        hasPrinterListPromise.resolve();
        updateAllRecover();
      }
      $rootScope.$broadcast('printerListUpdated', $rootScope.printerList);
    }
  };
  var printerPoller = function printerPoller() {
    if (pollerPromise !== null && pollerPromise !== true) {
      $timeout.cancel(pollerPromise);
    }
    pollerPromise = true;
    RSCom.send('listPrinter', {}).then(function (r) {
      parsePrinterList(r);
      pollerPromise = $timeout(printerPoller, 5000);
    }, function () {
      pollerPromise = null;
    });
  };
  var extendState = function extendState(st, slug) {
    if (st.fans) {
      st.fans.forEach(function (f) {
        f.percent = Math.floor(0.5 + f.voltage / 2.55);
      });
    }
    if ($rootScope.printer[slug].status) {
      //st.isJobActive = $rootScope.printer[slug].status.job !== 'none'
      st.isJobActive = $rootScope.printer[slug].status.jobstate === 'running';
      st.canMove = !st.doorOpen || $rootScope.printerConfig && $rootScope.printerConfig[slug] && $rootScope.printerConfig[slug].general.doorHandling !== 2;
    } else {
      st.isJobActive = false;
      st.canMove = false;
    }
  };
  var assignPrinterState = function assignPrinterState(slug, data) {
    var pk = $rootScope.printer[slug];
    if (!pk) return;
    if (data.x !== undefined) {
      var moved = pk.state.x !== data.x || pk.state.x !== data.y || pk.state.x !== data.z;
      if (pk.state && pk.state.heatedBeds && pk.state.heatedBeds[0] && pk.state.heatedBeds[0].history && !data.heatedBeds[0].history) {
        data.heatedBeds[0].history = pk.state.heatedBeds[0].history;
      }
      if (pk.state && pk.state.heatedChambers && pk.state.heatedChambers[0] && pk.state.heatedChambers[0].history && !data.heatedChambers[0].history) {
        data.heatedChambers[0].history = pk.state.heatedChambers[0].history;
      }
      angular.forEach(data.extruder, function (val, idx) {
        if (!val.history && pk.state && pk.state.extruder && pk.state.extruder[idx] && pk.state.extruder[idx].history) val.history = pk.state.extruder[idx].history;
      });
      pk.state = data;
      extendState(pk.state, slug);
      if (moved && slug === $rootScope.activeSlug) {
        // $rootScope.$broadcast('move', {data: pk.state}) // TODO
        $rootScope.$broadcast('toolMoved', {
          data: pk.state
        });
      }
    } else {
      pk.state = Object.assign({}, pk.state, data);
      pk.state.isJobActive = false;
      pk.state.canMove = false;
    }
  };
  // Updates all printer states in a second interval
  var statePoller = function statePoller() {
    if (statePollerPromise !== null && statePollerPromise !== true) {
      // Stop old timer
      $timeout.cancel(statePollerPromise);
    }
    if (!User.isLoggedIn) {
      statePollerPromise = $timeout(statePoller, 2000);
      return;
    }
    statePollerPromise = true;
    RSCom.send('stateList', {
      includeHistory: firstStatePoll
    }).then(function (r) {
      // console.log('state polled')
      $rootScope.stateTime = new Date().getTime(); // Time of last state change
      angular.forEach(r, function (data, key) {
        assignPrinterState(key, data);
      });
      firstStatePoll = false;
      statePollerPromise = $timeout(statePoller, 2000);
    }, function /*err*/
    () {
      statePollerPromise = $timeout(statePoller, 2000);
    });
  };
  $rootScope.$on('state', function (event, data) {
    if (data && data.printer && $rootScope.printer[data.printer]) {
      angular.extend($rootScope.printer[data.printer].state, data.data);
      extendState($rootScope.printer[data.printer].state, data.printer);
    }
  });
  $rootScope.$on('updatePrinterState', function (event, data) {
    assignPrinterState(data.printer, data.data);
  });
  $rootScope.$on('printerListChanged', function (event, r) {
    parsePrinterList(r.data);
  });
  $rootScope.$on('temp', function (event, data) {
    // update temperature graphs with new values
    var printer = $rootScope.printer[data.printer];
    if (!printer || !printer.state) return; // not loaded yet
    var id = data.data.id;
    if (typeof printer.state == 'undefined') console.log('history error', printer);
    if (id >= 0 && typeof printer.state.extruder === 'undefined') return;
    var hist = id > 999 ? id > 1999 ? printer.state.heatedChambers[id - 2000] : printer.state.heatedBeds[id - 1000] : typeof printer.state.extruder[id] === 'undefined' ? undefined : printer.state.extruder[id];
    if (!hist) return; // can happen if more extruders are there then configured
    if (!hist.history) {
      hist.history = [];
    }
    while (hist.history.length > 0 && hist.history[0].t + 300000 < data.data.t) {
      hist.history.splice(0, 1);
    }
    hist.history.push(data.data);
  });
  // Update configuration when changed
  $rootScope.$on('config', function (event, data) {
    var c = data.data;
    c.isZBelt = c.shape.basicShape.shape === 'zbelt';
    $rootScope.printerConfig[c.general.slug] = c;
    $rootScope.activeConfig = $rootScope.printerConfig[$rootScope.activeSlug];
  });

  /*  $rootScope.$on("settingsChanged", function (event, data) {
   $.extend($rootScope.serverSettings, data.data);
   });
   $rootScope.serverSettingsChanged = function () {
   RSCom.send("updateSettings", $rootScope.serverSettings);
   };*/
  function readExternalLinks() {
    RSCom.send('getExternalLinks', {}).then(function (r) {
      $rootScope.externalLinks = r.links;
      $rootScope.globalExternalLinks = [];
      angular.forEach($rootScope.externalLinks, function (x) {
        if (x.gui && x.slug === '') {
          $rootScope.globalExternalLinks.push(x);
        }
      });
      $rootScope.$broadcast('int_externalLinksChanged', $rootScope.externalLinks);
    });
  }
  $rootScope.$on('connected', function () {
    if (pollerPromise === null) {
      printerPoller();
    }
    if (statePollerPromise === null) {
      statePoller();
    }
    RSCom.send('listExternalCommands', {}).then(function (r) {
      $rootScope.externalCommands = r;
      $rootScope.$broadcast('externalCommandsChanged', r);
    });
    readExternalLinks();
    RSCom.send('webCallsList', {}).then(function (r) {
      $rootScope.webCalls = r.list;
      $rootScope.$broadcast('webCallsListChanged', r);
    });
    RSCom.send('GPIOGetList', {}).then(function (r) {
      $rootScope.gpio = r.list;
      $rootScope.$broadcast('gpioChanged', r);
    });
    updateFolders();
    updateAllRecover();
    updateDialogs();
    updateManufacturerNews();
  });
  $rootScope.$on('externalLinksChanged', readExternalLinks);
  $rootScope.$on('recoverChanged', function (event, x) {
    if ($rootScope.printer[x.printer]) {
      $rootScope.printer[x.printer].recover = x.data;
    }
  });
  $rootScope.$on('reconnectCounter', function (event, x) {
    $rootScope.printer[x.printer].reconnectCounter = x.data.reconnectCounter;
  });
  $rootScope.$on('webCallsChanged', function () {
    RSCom.send('webCallsList', {}).then(function (r) {
      $rootScope.webCalls = r.list;
      $rootScope.$broadcast('webCallsListChanged', r);
    });
  });
  $rootScope.$on('gpioListChanged', function () {
    RSCom.send('GPIOGetList', {}).then(function (r) {
      $rootScope.gpio = r.list;
      $rootScope.$broadcast('gpioChanged', r);
    });
  });
  $rootScope.$on('gpioPinChanged', function (event, x) {
    x = x.data;
    if ($rootScope.gpio) {
      angular.forEach($rootScope.gpio, function (p) {
        if (x.uuid === p.uuid) {
          p.state = x.state;
          p.pwmDutyCycle = x.pwmDutyCycle;
        }
      });
    }
  });
  $rootScope.$on('disconnected', function () {
    if (pollerPromise !== null && pollerPromise !== true) {
      $timeout.cancel(pollerPromise);
    }
    pollerPromise = null;
    if (statePollerPromise !== null && statePollerPromise !== true) {
      $timeout.cancel(statePollerPromise);
    }
    statePollerPromise = null;
  });
  return {
    selectPrinter: function selectPrinter(slug) {
      RSCom.selectPrinter(slug);
      $rootScope.activeSlug = slug;
      if (slug === '') {
        $rootScope.activeConfig = {};
        $rootScope.active = {};
      } else {
        $rootScope.activeConfig = $rootScope.printerConfig[slug];
        if ($rootScope.printer[slug]) {
          $rootScope.active = $rootScope.printer[slug];
        }
      }
      $rootScope.$broadcast('printerSelected', slug);
    },
    runExternalCommand: function runExternalCommand(id) {
      var cmd = $rootScope.externalCommands[id];
      var stopForPrint = false;
      if (cmd.ifAllNotPrinting) {
        stopForPrint = Object.values($rootScope.printer).filter(function (x) {
          return x.state.isJobActive;
        }).length > 0;
      }
      if (cmd.ifThisNotPrinting && cmd.slug && $rootScope.printer[cmd.slug]) {
        stopForPrint || (stopForPrint = $rootScope.printer[cmd.slug].state.isJobActive);
      }
      if (stopForPrint) {
        Flash.error("<?php _('Printer not idle - execution stopped!') ?>");
        return;
      }
      if (cmd.confirm.length > 0) {
        Confirm("<?php _('Security Question') ?>", cmd.confirm, "<?php _('Yes') ?>", "<?php _('No') ?>", true).then(function () {
          if (cmd.terminal) {
            $state.go('terminalCommand', {
              id: id
            });
          } else {
            RSCom.send('runExternalCommand', {
              id: id
            });
          }
        }, function () {});
      } else if (cmd.terminal) {
        $state.go('terminalCommand', {
          id: id
        });
      } else {
        RSCom.send('runExternalCommand', {
          id: id
        });
      }
    },
    supportsFullscreen: function supportsFullscreen() {
      var ele = window.document.body;
      return ele.requestFullscreen || ele.mozRequestFullScreen || ele.webkitRequestFullscreen || ele.msRequestFullscreen;
    },
    updateStateNow: function updateStateNow() {
      setTimeout(statePoller, 100);
    },
    updatePrintersNew: function updatePrintersNew() {
      printerPoller();
    },
    printerListLoadedPromise: hasPrinterListPromise.promise
  };
}]).factory('RSMessages', ['$rootScope', 'RSCom', function ($rootScope, RSCom) {
  var messages = [];
  $rootScope.messages = messages;
  /*var hasMessage = function (m) {
    var isNew = true
    angular.forEach(messages, function (msg) {
      if (msg.id === m.id) isNew = false
    })
    return isNew
  }*/
  var messagesPoller = function messagesPoller() {
    RSCom.send('messages', {}).then(function (r) {
      /*angular.forEach(r, function (msg) {
       if (!hasMessage(msg)) {
       messages.unshift(msg);
       Flash.info(msg.msg, "", 60000, true);
       }
       });*/
      $rootScope.messages = messages = r;
    });
  };
  $rootScope.$on('messagesChanged', function () {
    messagesPoller();
  });
  $rootScope.$on('connected', function () {
    messagesPoller();
  });
  var removeMessage = function removeMessage(m) {
    var a = 'job';
    if (m.link.indexOf('unpause') > 0) a = 'unpause';
    RSCom.send('removeMessage', {
      id: m.id,
      a: a
    }, m.slug);
  };
  var removeAll = function removeAll() {
    angular.forEach(messages, function (m) {
      if (m.link.indexOf('unpause') < 0) removeMessage(m);
    });
  };
  var factory = {
    messages: messages,
    remove: removeMessage,
    removeAll: removeAll
  };
  $rootScope.RSMessages = factory;
  return factory;
}]).factory('Flash', function () {
  var flash = {};
  toastr.options = {
    'closeButton': false,
    'debug': false,
    'positionClass': 'toast-bottom-right',
    'onclick': null,
    'showDuration': '300',
    'hideDuration': '1000',
    'timeOut': '5000',
    'extendedTimeOut': '1000',
    'showEasing': 'swing',
    'hideEasing': 'linear',
    'showMethod': 'fadeIn',
    'hideMethod': 'fadeOut'
  };
  flash.success = function (head, msg, dur, close) {
    if (!head && !msg) {
      return;
    }
    if (!close) close = false;
    toastr.options.closeButton = close;
    toastr.options.timeOut = dur || 5000;
    toastr.success(msg, head);
  };
  flash.info = function (head, msg, dur, close) {
    if (!head && !msg) {
      return;
    }
    if (!close) close = false;
    toastr.options.closeButton = close;
    toastr.options.timeOut = dur || 5000;
    toastr.info(msg, head);
  };
  flash.warning = function (head, msg, dur, close) {
    if (!head && !msg) {
      return;
    }
    if (!close) close = false;
    toastr.options.closeButton = close;
    toastr.options.timeOut = dur || 5000;
    toastr.warning(msg, head);
  };
  flash.error = function (head, msg, dur, close) {
    if (!head && !msg) {
      return;
    }
    if (!close) close = false;
    toastr.options.closeButton = close;
    toastr.options.timeOut = dur || 5000;
    toastr.error(msg, head);
  };
  return flash;
}).factory('RSPasswordCheck', ['RSCom', function (RSCom) {
  var rules = {};
  RSCom.send('getPasswordRules', {}).then(function (r) {
    rules = r;
  });
  return function (pw) {
    var count1 = 0,
      count2 = 0,
      count3 = 0;
    if (pw.length < rules.minLength) {
      return "<?php _('Minimum password length is @1') ?>".replace('@1', rules.minLength);
    }
    if (rules.differentCharacterGroups) {
      var _iterator3 = _createForOfIteratorHelper(pw),
        _step3;
      try {
        for (_iterator3.s(); !(_step3 = _iterator3.n()).done;) {
          var c = _step3.value;
          if (c >= 'a' && c <= 'z') {
            count1 = 1;
          } else if (c >= 'A' && c <= 'Z') {
            count2 = 1;
          } else {
            count3 = 1;
          }
        }
      } catch (err) {
        _iterator3.e(err);
      } finally {
        _iterator3.f();
      }
      if (count1 + count2 + count3 < 2) {
        return "Password must contain characters of different groups a-z, A-Z and other characters";
      }
    }
    return "";
  };
}]).factory('GSettings', ['RSCom', '$rootScope', '$q', '$state', function (RSCom, $rootScope, $q, $state) {
  var settings = {};
  var original = {};
  var loadedPromise = $q.defer();
  $rootScope.serverSettings = {
    pricing: {
      currency: 'EUR',
      digits: 2,
      perPrint: 5.0,
      perHour: 0.3,
      filaments: [{
        u: RSUtils.createAlphaID(10),
        n: 'PLA',
        p: 25.0,
        w: 1.25
      }],
      map: {}
    }
  };
  $rootScope.$on('settingChanged', function (event, data) {
    $.extend($rootScope.serverSettings, data.data);
    $.extend(original, angular.copy(data.data));
  });
  settings.serverSettingsChanged = function () {
    var modified = {};
    angular.forEach($rootScope.serverSettings, function (val, key) {
      if (!angular.equals(val, original[key])) {
        modified[key] = angular.copy(val);
      }
    });
    if ($.isEmptyObject(modified)) {
      var q = $q.defer();
      q.resolve();
      return q.promise;
    }
    original = angular.copy($rootScope.serverSettings);

    //console.log("saving settings", modified);
    return RSCom.send('updateSettings', modified);
  };
  var loadSettings = function loadSettings() {
    RSCom.send('getSettings', {}).then(function (r) {
      angular.extend($rootScope.serverSettings, r);
      original = angular.copy($rootScope.serverSettings);
      loadedPromise.resolve();
      if ($rootScope.serverSettings.policy_accepted === false) {
        $state.go('privacypolicy');
      }
    });
  };
  $rootScope.$on('connected', function () {
    loadSettings();
  });
  if (RSCom.connected) loadSettings();
  settings.promise = loadedPromise.promise;
  return settings;
}]).filter('slice', function () {
  return function (input, limit, begin) {
    if (!input) return [];
    if (Math.abs(Number(limit)) === Infinity) {
      limit = Number(limit);
    } else {
      limit = parseInt(limit);
    }
    if (isNaN(limit)) return input;
    begin = !begin || Number.isNaN(begin) ? 0 : parseInt(begin);
    begin = begin < 0 && begin >= -input.length ? input.length + begin : begin;
    if (limit >= 0) {
      return input.slice(begin, begin + limit);
    } else {
      if (begin === 0) {
        return input.slice(limit, input.length);
      } else {
        return input.slice(Math.max(0, begin + limit), begin);
      }
    }
  };
}).factory('Theme', ['$rootScope', function ($rootScope) {
  var service = {
    mode: 'auto',
    detected: ''
  };
  var DARK = '(prefers-color-scheme: dark)';
  var LIGHT = '(prefers-color-scheme: light)';
  function setTheme(scheme) {
    $rootScope.theme = scheme;
    document.getElementsByTagName('html')[0].setAttribute('data-theme', scheme);
    $rootScope.$broadcast('themeChanged', scheme);
  }
  function detectColorScheme() {
    if (!window.matchMedia) {
      console.log('matchMedia not supported');
      return;
    }
    function listener(x) {
      if (!x.matches) {
        // Not matching anymore = not interesting
        return;
      }
      if (x.media === DARK) {
        service.detected = 'dark';
        if (service.mode === 'auto') {
          setTheme('dark');
        }
      } else if (x.media === LIGHT) {
        service.detected = 'light';
        if (service.mode === 'auto') {
          setTheme('light');
        }
      }
    }
    var /** MediaQueryList */mqDark = window.matchMedia(DARK);
    // noinspection JSDeprecatedSymbols
    mqDark.addListener(listener);
    listener(mqDark);
    var mqLight = window.matchMedia(LIGHT);
    // noinspection JSDeprecatedSymbols
    mqLight.addListener(listener);
    listener(mqLight);
  }
  function setMode(mode) {
    if (mode === 'auto') {
      if (service.mode !== 'auto') {
        service.mode = 'auto';
        setTheme(service.detected);
      }
    } else {
      service.mode = mode;
      setTheme(mode);
    }
  }
  detectColorScheme();
  service.setMode = setMode;
  return service;
}]).factory('Wifi', ['RSCom', '$rootScope', function (RSCom, $rootScope) {
  var service = {
    routerListResponse: undefined,
    apModeList: [{
      id: 0,
      n: "<?php _('Never enable AP') ?>"
    }, {
      id: 1,
      n: "<?php _('Enable AP when not connected') ?>"
    }, {
      id: 2,
      n: "<?php _('Always enable AP') ?>"
    }]
  };
  var updatingList = false;
  service.updateRouterList = function () {
    if (updatingList) {
      return;
    }
    if (RSCom.connected === false) {
      return;
    }
    updatingList = true;
    //RSCom.send('wifiScanRouter', {}).then(  // returns last state
    RSCom.send('wifiRefreshRouter', {}).then(
    // rescans networks
    function (r) {
      service.routerListResponse = r;
      updatingList = false;
      //this.server.fireLocalEvent("routerListReceived");
    }, function () {
      updatingList = false;
    });
  };
  service.setWifiList = function (list) {
    service.routerListResponse = list;
    //this.server.fireLocalEvent("routerListReceived");
  };

  $rootScope.$on('wifiChanged', function (evt, data) {
    // console.log("wifiChanged", data.data);
    var reg = service.routerListResponse.regions;
    service.routerListResponse = Object.assign(service.routerListResponse, data.data, {
      ethernet: Object.assign(service.routerListResponse.ethernet, data.data.ethernet)
    });
    service.routerListResponse.regions = reg;
  });
  service.refreshRouterList = function () {
    if (updatingList) return;
    if (RSCom.connected === false) return;
    updatingList = true;
    RSCom.send('wifiRefreshRouter').then(function (r) {
      service.routerListResponse = r;
      updatingList = false;
      //this.server.fireLocalEvent("routerListReceived");
    }, function () {
      updatingList = false;
    });
  };
  service.eth = function () {
    return service.routerListResponse.ethernet;
  };
  service.getRouterList = function () {
    if (!service.routerListResponse) {
      return [];
    }
    return service.routerListResponse.routerList;
  };
  service.getManageable = function () {
    if (!service.routerListResponse) {
      service.updateRouterList(); // for next request
      return false;
    }
    return service.routerListResponse.manageable;
  };
  service.manualWifi = function () {
    return service.routerListResponse.manualWifi;
  };
  service.getHostname = function () {
    return service.routerListResponse.hostname;
  };
  service.setHostname = function (hn) {
    RSCom.send('wifiSetHostname', {
      hostname: hn
    });
  };
  service.getAPSSID = function () {
    return service.routerListResponse.apSSID;
  };
  service.setAPSSID = function (ssid) {
    RSCom.send('wifiSetAPSSID', {
      ssid: ssid
    });
  };
  service.setAPPassword = function (pw) {
    RSCom.send('wifiSetAPPassword', {
      password: pw
    });
  };
  service.getAPMode = function () {
    return service.routerListResponse.apMode;
  };
  service.getSupportAP = function () {
    return service.routerListResponse.supportAP;
  };
  service.setAPMode = function (mode) {
    RSCom.send('wifiSetAPMode', {
      apMode: mode
    });
  };
  service.getAPChannel = function () {
    return service.routerListResponse.channel;
  };
  service.setAPChannel = function (channel) {
    RSCom.send('wifiSetAPChannel', {
      channel: channel
    });
  };
  service.getRegion = function () {
    return service.routerListResponse.country;
  };
  service.setRegion = function (country) {
    RSCom.send('wifiSetCountry', {
      country: country
    });
  };
  service.setAPPassword = function (pw) {
    RSCom.send('wifiSetAPPassword', {
      password: pw
    });
  };
  service.connect = function (uuid) {
    return RSCom.send('wifiConnect', {
      uuid: uuid
    });
  };
  /* service.connectPassword = function (ssid, pw) {
    return RSCom.send("wifiConnectPW", {ssid: ssid, password: pw});
  }; */
  service.activateAP = function () {
    RSCom.send('wifiActivateAP', {});
  };
  service.updateRouterList();
  return service;
}]);
},{"../slicer/Helper3D":112,"./RSUtils.js":101,"axios":1}],95:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

/**
 * @ngdoc service
 * @name RSBase.services.Confirm
 * @requires $q
 * @requires $rootScope
 * @requires $compile
 * @requires $controller
 * @param {string} headline Headline
 * @param {string} message Confirm message
 * @param {string} yes Text for confirm, default = Yes
 * @param {string} no Text for not confirm, default = No
 * @returns {promise} Promise about result.
 * @description Shows a confirm box with yes and no as answers. Returns a promise
 * that gets resolved when user hits yes and gets rejected otherwise.
 */
RSBase.factory('Confirm', ['$uibModal', '$sce', function ($uibModal, $sce) {
  /* @ngdoc method
   * @name app.services.ConfirmBox#ConfirmBox
   * @methodOf app.services.ConfirmBox
   *
   * @description Shows a confirm box with yes and no as answers. Returns a promise
   * that gets resolved when user hits yes and gets rejected otherwise.
   * @param {String} Message to confirm.
   * @returns {promise} Promise about result.
   *     controller: ['$sce', function ($sce) {
    const that = this
    this.html = ''
    let updateIcon = () => {
      if (!that.iconImg) {
        this.html = ''
        return
      }
      console.log('iconchange', that.iconImg)
      if (that.iconImg.indexOf('<svg') === 0) {
        that.html = $sce.trustAsHtml(that.iconImg)
   */
  return function (head, question, yes, no, danger, html, confirmOnly) {
    var dia = $uibModal.open({
      templateUrl: '/views/base/confirm.php?lang=' + lang,
      controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
        $scope.infoText = question;
        $scope.infoHeader = head;
        $scope.infoYes = yes || "<?php _('Yes') ?>";
        $scope.infoNo = no || "<?php _('No') ?>";
        $scope.infoHtml = $sce.trustAsHtml(html || '');
        $scope.infoNoClass = "";
        $scope.infoYesClass = "";
        if (confirmOnly) {
          $scope.infoNoClass += "hidden ";
        }
        if (!danger) {
          $scope.infoYesClass += "btn-primary";
          $scope.infoNoClass += "btn-default";
        } else {
          $scope.infoYesClass += "btn-danger";
          $scope.infoNoClass += "btn-primary";
        }
        // if (confirmOnly) {
        //   $scope.infoNoClass += " hidden"
        // }
        $scope.confirmNo = function () {
          $uibModalInstance.dismiss();
        };
        $scope.confirmYes = function () {
          $uibModalInstance.close();
        };
      }],
      size: 'lg'
    });
    dia.result.catch(function (res) {});
    return dia.result;
  };
}]).factory('Info', ['$uibModal', function ($uibModal) {
  /* @ngdoc method
   * @name app.services.ConfirmBox#ConfirmBox
   * @methodOf app.services.ConfirmBox
   *
   * @description Shows a confirm box with yes and no as answers. Returns a promise
   * that gets resolved when user hits yes and gets rejected otherwise.
   * @param {String} Message to confirm.
   * @returns {promise} Promise about result.
   */
  return function (head, question, okText) {
    var dia = $uibModal.open({
      templateUrl: '/views/base/info.php?lang=' + lang,
      controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
        $scope.infoText = question;
        $scope.infoHeader = head;
        $scope.infoOk = okText || "<?php _('ok') ?>";
        $scope.infoOkClass = "btn-primary";
        $scope.ok = function () {
          $uibModalInstance.close();
        };
      }],
      size: 'lg'
    });
    dia.result.catch(function (res) {});
    return dia.result;
  };
}]).factory('StringDialog', ['$uibModal', function ($uibModal) {
  /* @ngdoc method
   * @name app.services.ConfirmBox#ConfirmBox
   * @methodOf app.services.ConfirmBox
   *
   * @description Shows a confirm box with yes and no as answers. Returns a promise
   * that gets resolved when user hits yes and gets rejected otherwise.
   * @param {String} Message to confirm.
   * @returns {promise} Promise about result.
   */
  return function (head, question, defaultText, yes, no, danger) {
    var dia = $uibModal.open({
      templateUrl: '/views/base/string.php?lang=' + lang,
      controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
        $scope.value = defaultText;
        $scope.infoText = question;
        $scope.infoHeader = head;
        $scope.infoYes = yes || "<?php _('Ok') ?>";
        $scope.infoNo = no || "<?php _('Cancel') ?>";
        if (!danger) {
          $scope.infoYesClass = "btn-primary";
          $scope.infoNoClass = "btn-default";
        } else {
          $scope.infoYesClass = "btn-danger";
          $scope.infoNoClass = "btn-primary";
        }
        $scope.confirmNo = function () {
          $uibModalInstance.dismiss();
        };
        $scope.confirmYes = function () {
          $uibModalInstance.close($scope.value);
        };
        setTimeout(function () {
          var e = document.getElementById("textinput");
          if (e) {
            e.focus();
          }
        }, 200);
      }],
      size: 'sm',
      backdrop: 'static'
    });
    dia.result.catch(function (res) {});
    return dia.result;
  };
}]);
},{}],96:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

RSBase.factory('RSFirmware', ['$q', '$rootScope', 'RSCom', '$filter', function ($q, $rootScope, RSCom, $filter) {
  var Service = {};
  var loaded1 = $q.defer();
  Service.firmwareNames = [];
  Service.firmwareInfo = [];
  var updateNames = function updateNames() {
    RSCom.send("listFirmwareNames", {}).then(function (data) {
      Service.firmwareNames = $filter('orderBy')(data.firmwareNames, '', false);
      loaded1.resolve();
    });
  };
  var updateInfo = function updateInfo() {
    RSCom.send("listFirmwareInfo", {}).then(function (data) {
      Service.firmwareInfo = $filter('orderBy')(data.firmwareInfo, 'name', false);
      loaded1.resolve();
    });
  };
  $rootScope.$on("connected", function () {
    if (Service.firmwareNames.length === 0) updateNames();
    updateInfo();
  });
  updateNames();
  updateInfo();
  Service.promise = $q.all([loaded1]);
  return Service;
}]);
},{}],97:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

(function () {
  var printerMenu = [];
  var printerTabs = [];
  var printerConfigTabs = [];
  var frontend = {
    setupMenu: [],
    printerMenu: [],
    printerTabs: [],
    printerConfigTabs: [],
    globalSettings: [],
    visible: {
      "true": true,
      "false": false
    }
  };
  function comparePrio(a, b) {
    if (a.prio < b.prio) return -1;
    if (a.prio > b.prio) return 1;
    return 0;
  }
  /* Registers a menu entry. Parameter must an object with
   string:name - Menu entry name
   bool:visible - Function returning true when entry should be visible
   func:exec - Function to be called
   string:icon - icon classes
   */
  frontend.registerPrinterMenuEntry = function (entry) {
    if (!entry.prio) entry.prio = 10000;
    printerMenu.push(entry);
    printerMenu.sort(comparePrio);
  };

  /* Extends main command menu. Same parameter as printer menu */
  frontend.registerSetupMenuEntry = function (entry) {
    if (!entry.prio) entry.prio = 10000;
    frontend.setupMenu.push(entry);
    frontend.setupMenu.sort(comparePrio);
  };

  /* entry format:
   string:name:Visible tab name
   bool:visible true if tab should be visible
   string:state State of tab content
   */
  frontend.registerPrinterTab = function (entry) {
    if (!entry.prio) entry.prio = 10000;
    printerTabs.push(entry);
    printerTabs.sort(comparePrio);
  };
  frontend.setPrinterTabNameByState = function (state, newName) {
    angular.forEach(printerTabs, function (t) {
      if (t.state === state) {
        t.name = newName;
      }
    });
  };
  frontend.setPrinterTabIconByState = function (state, newIcon) {
    angular.forEach(printerTabs, function (t) {
      if (t.state === state) {
        t.icon = newIcon;
      }
    });
  };

  /* entry format:
   string:name:Visible tab name
   bool:visible true if tab should be visible
   string:state State of tab content
   */
  frontend.registerPrinterConfigTab = function (entry) {
    if (!entry.prio) entry.prio = 10000;
    printerConfigTabs.push(entry);
    printerConfigTabs.sort(comparePrio);
  };

  /*
   Adds a new config entry in global settings. Paremeter is a object with:
   string:name - Menu entry
   string:url - route to config
    */
  frontend.registerGlobalSettingsConfig = function (entry) {
    frontend.globalSettings.push(entry);
  };
  frontend.setVisible = function (name, val) {
    frontend.visible[name] = val;
  };
  var showEntry = function showEntry(e, online, active) {
    if (e.visible && !frontend.visible[e.visible]) return false;
    if (e.requireOnline && !online) return false;
    return !(e.requireActive && !active);
  };
  RSBase.provider('RSFrontend', [function () {
    this.$get = function () {
      return frontend;
    };
    this.registerPrinterTab = frontend.registerPrinterTab;
    this.setPrinterTabNameByState = frontend.setPrinterTabNameByState;
    this.registerPrinterConfigTab = frontend.registerPrinterConfigTab;
    this.registerSetupMenuEntry = frontend.registerSetupMenuEntry;
    this.registerGlobalSettingsConfig = frontend.registerGlobalSettingsConfig;
    this.registerPrinterMenuEntry = frontend.registerPrinterMenuEntry;
    this.setVisible = frontend.setVisible;
  }]);
  RSBase.run(['$rootScope', 'RSFrontend', function ($rootScope, RSFrontend) {
    $rootScope.frontend = RSFrontend;
    var updateLists = function updateLists() {
      var online = $rootScope.active && $rootScope.active.status && $rootScope.active.status.online === 1;
      var active = $rootScope.active && $rootScope.active.status && $rootScope.active.status.active;
      frontend.printerTabs = [];
      angular.forEach(printerTabs, function (e) {
        if (showEntry(e, online, active)) frontend.printerTabs.push(e);
      });
      frontend.printerConfigTabs = [];
      angular.forEach(printerConfigTabs, function (e) {
        if (showEntry(e, online, active)) frontend.printerConfigTabs.push(e);
      });
      frontend.printerMenu = [];
      angular.forEach(printerMenu, function (e) {
        if (showEntry(e, online, active)) frontend.printerMenu.push(e);
      });
    };
    frontend.setVisible = function (name, val) {
      frontend.visible[name] = val;
      updateLists();
    };
    $rootScope.$watch("active.status.online", updateLists);
    $rootScope.$watch("active.status.active", updateLists);
    updateLists();
  }]);
})();
},{}],98:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

//noinspection JSUnusedLocalSymbols
var dummy = {
  invertX: undefined,
  invertY: undefined,
  invertZ: undefined,
  filterFan: undefined
};
RSBase.factory('RSPrinter', ['$q', '$rootScope', 'RSOverview', 'RSCom', '$uibModal', 'RSPrinterConfig', '$timeout', '$filter', 'Flash', 'User', 'localStorageService', 'Confirm', function ($q, $rootScope, RSOverview, RSCom, $uibModal, RSPrinterConfig, $timeout, $filter, Flash, User, localStorageService, Confirm) {
  var updateGCodeQueues = function updateGCodeQueues() {
    if ($rootScope.activeSlug) {
      Service.fetchModelsFor($rootScope.activeSlug);
      Service.fetchPrintqueueFor($rootScope.activeSlug);
      Service.updateExcludeRegions();
    }
  };
  var Service = {
    excludeRegions: [],
    pauseNames: ["<?php _('Pause') ?>", "<?php _('Continue') ?>", "<?php _('Preheat') ?>", "<?php _('Heating...') ?>", "<?php _('Continue') ?>"],
    eepromLoaded: false,
    eepromErrors: false,
    eepromData: []
  };
  $rootScope.RSPrinter = Service;
  if (!$rootScope.globals) $rootScope.globals = {};
  Service.globals = $rootScope.globals;
  var imageUrls = {};
  var imageUrl = function imageUrl(slug, queue, id, sz, version) {
    if (!version) {
      version = 1;
    }
    if (typeof id == "undefined") {
      return "/mod/server/img/rendering_" + sz + ".png";
    }
    var key = slug + "_" + queue + id + sz;
    if (!imageUrls[key]) {
      imageUrls[key] = "/dyn/render_image?q=" + queue + "&id=" + id + "&slug=" + slug + "&t=" + sz + "&sess=" + User.getSessionEncoded() + "&v=" + version; // + "&tm=" + new Date().getTime();
      /* if (queue === "jobs") {
        imageUrls[key] += "&tm=" + new Date().getTime()
      } */
    }

    if ($rootScope.hasFeature(1)) return imageUrls[key];
    return "/img/pro_" + sz + ".png";
  };
  $rootScope.$on("connected", function () {
    // Delete all images from translation list
    imageUrls = [];
    updateGCodeQueues();
  });
  $rootScope.$on('gcodeInfoUpdated', function (event, x) {
    var data = x.data;
    if (data.list === "jobs") Service.fetchPrintqueueFor(x.printer);else Service.fetchModelsFor(x.printer);
  });
  // Image has changed, initiate update
  $rootScope.$on('newRenderImage', function (event, x) {
    var data = x.data;
    var key = x.printer + "_" + data.list + data.id;
    // console.log('new image', JSON.stringify(data), data)
    imageUrls[key + "l"] = "/dyn/render_image?q=" + data.list + "&id=" + data.id + "&slug=" + x.printer + "&t=l&tm=" + new Date().getTime() + "&sess=" + User.getSessionEncoded();
    imageUrls[key + "m"] = "/dyn/render_image?q=" + data.list + "&id=" + data.id + "&slug=" + x.printer + "&t=m&tm=" + new Date().getTime() + "&sess=" + User.getSessionEncoded();
    imageUrls[key + "s"] = "/dyn/render_image?q=" + data.list + "&id=" + data.id + "&slug=" + x.printer + "&t=s&tm=" + new Date().getTime() + "&sess=" + User.getSessionEncoded();
    if (data.list === "jobs") Service.fetchPrintqueueFor(x.printer);else Service.fetchModelsFor(x.printer);
  });
  Service.setActivePage = function (slug, pg) {
    var old = localStorageService.get('v1PrinterPage');
    if (old === null) {
      old = {};
    }
    old[slug] = pg;
    localStorageService.set('v1PrinterPage', old);
  };
  Service.getActivePage = function (slug, fallback) {
    var old = localStorageService.get('v1PrinterPage');
    if (old === null) {
      old = {};
    }
    if (old[slug]) {
      return old[slug];
    }
    return fallback;
  };
  Service.printingImage = function (imgSize, slug) {
    if (!$rootScope.active.status || !$rootScope.active.status.jobid) return "";
    return imageUrl(slug || $rootScope.activeSlug, 'jobs', $rootScope.active.status.jobid, imgSize || 'l');
  };
  Service.sortModelsFor = function (slug) {
    var loc = Service.localFor(slug);
    var sortBy = loc.sortModelsBy || 0;
    var reverse = (sortBy & 1) === 1;
    var orderBy = $filter('orderBy');
    var p = $rootScope.printer[slug];
    switch (sortBy & 254) {
      case 0:
        p.models = orderBy(p.allModels, 'name', reverse);
        break;
      case 2:
        p.models = orderBy(p.allModels, 'created', reverse);
        break;
      case 4:
        p.models = orderBy(p.allModels, 'printTime', reverse);
        break;
      case 6:
        p.models = orderBy(p.allModels, 'length', reverse);
        break;
      case 8:
        p.models = orderBy(p.allModels, 'lines', reverse);
        break;
      case 10:
        p.models = orderBy(p.allModels, 'filamentTotal', reverse);
        break;
      case 12:
        p.models = orderBy(p.allModels, 'layer', reverse);
        break;
    }
    var filter = (loc.modelFilter || "").toLowerCase();
    if (filter !== '') {
      // var reduce = $filter('filter');
      //  p.models = reduce(p.models, {name: filter/* , notes:filter*/}, false);
      p.models = p.models.reduce(function (arr, val) {
        if (val.name.toLowerCase().indexOf(filter) !== -1 || val.notes.toLowerCase().indexOf(filter) !== -1) {
          arr.push(val);
        }
        return arr;
      }, []);
    }
    if (loc.activeGroup !== "*") {
      var filtered = [];
      angular.forEach(p.models, function (v) {
        if (v.group === loc.activeGroup) filtered.push(v);
      });
      p.models = filtered;
      if ($rootScope.globals.gcodeView && $rootScope.globals.gcodeView.perPage <= p.models.length) {
        $rootScope.globals.gcodeView.page = 1;
      }
    }
  };
  Service.localFor = function (slug) {
    var p = $rootScope.printer[slug];
    if (p === undefined) return undefined;
    if (typeof p.local === 'undefined') p.local = {};
    return p.local;
  };
  Service.local = function () {
    return Service.localFor($rootScope.activeSlug);
  };
  Service.showConnectionData = function () {
    RSCom.send("communicationData", {}).then(function (data) {
      $uibModal.open({
        templateUrl: '/views/printer/dialog/connectionData.php?lang=' + lang,
        controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
          $scope.comData = data;
          $scope.close = function () {
            $uibModalInstance.close();
          };
        }],
        size: 'sm'
      }).result.catch(function (res) {});
    });
  };
  Service.fetchPrintqueueFor = function (slug) {
    var p = $rootScope.printer[slug];
    if (!p) {
      return;
    }
    if (!p.queue) {
      p.queue = [];
    }
    RSCom.send("listJobs", {
      includeRunning: true
    }, slug).then(function (r) {
      p.queue = r.data;
      p.queueFilament = 0;
      p.queueTime = 0;
      p.queueLines = 0;
      var local = Service.localFor(slug);
      angular.forEach(p.queue, function (val) {
        val.error = val.analysed === 2;
        val.processing = val.analysed === 0;
        val.ok = val.analysed === 1;
        val.list = "jobs";
        val.imgL = imageUrl(slug, "jobs", val.id, "l", val.version);
        val.imgM = imageUrl(slug, "jobs", val.id, "m", val.version);
        val.imgT = imageUrl(slug, "jobs", val.id, "s", val.version);
        if (local.activeGCode && local.activeGCode.id === val.id && local.activeGCode.list === val.list) {
          local.activeGCode = val;
          $rootScope.$broadcast("selectActiveGCode", val, 1);
        }
        val.printTimeBest = val.lastPrintTime ? val.lastPrintTime : val.printTime;
        p.queueFilament += val.filamentTotal * val.repeat;
        p.queueTime += val.printTimeBest * val.repeat;
        p.queueLines += val.lines * val.repeat;
      });
    });
  };
  Service.fetchPrintqueue = function (event, data) {
    if (data.printer === $rootScope.activeSlug) {
      Service.fetchPrintqueueFor($rootScope.activeSlug);
    }
  };
  Service.fetchModelsFor = function (slug) {
    if (!$rootScope.printer[slug]) return;
    var p = $rootScope.printer[slug];
    if (!p.models) p.models = [];
    RSCom.send("listModels", {}, slug).then(function (r) {
      p.allModels = r.data;
      var local = Service.localFor(slug);
      angular.forEach(p.allModels, function (val) {
        val.error = val.analysed === 2;
        val.processing = val.analysed === 0;
        val.ok = val.analysed === 1;
        val.list = "models";
        val.imgL = imageUrl(slug, "models", val.id, "l", val.version);
        val.imgM = imageUrl(slug, "models", val.id, "m", val.version);
        val.imgT = imageUrl(slug, "models", val.id, "s", val.version);
        if (typeof local.activeGCode !== 'undefined' && local.activeGCode.id === val.id && local.activeGCode.list === val.list) {
          local.activeGCode = val;
          $rootScope.$broadcast("selectActiveGCode", val, 2);
        }
        val.printTimeBest = val.lastPrintTime ? val.lastPrintTime : val.printTime;
      });
      Service.sortModelsFor(slug);
    });
  };
  Service.fetchModels = function (event, data) {
    if (data.printer === $rootScope.activeSlug) {
      Service.fetchModelsFor($rootScope.activeSlug);
    }
  };
  Service.motorsOff = function () {
    RSCom.send("motorsOff", {});
  };
  Service.updateExcludeRegions = function () {
    RSCom.send("getExcludeRegions", {}).then(function (data) {
      Service.excludeRegions = data.regions;
      $rootScope.$broadcast("excludeRegionsStored");
    });
  };
  $rootScope.$on("printqueueChanged", Service.fetchPrintqueue);
  $rootScope.$on("jobsChanged", Service.fetchModels);
  $rootScope.$on("excludeRegionsChanged", Service.updateExcludeRegions);
  // Update file lists when printer name changes
  $rootScope.$watch('activeSlug', updateGCodeQueues);
  updateGCodeQueues();
  Service.hasFirmwareSettings = false;
  Service.firmwareSettings = [];
  var setConfigFromFirmware = function setConfigFromFirmware() {
    var c = RSPrinterConfig.config;
    var f = Service.firmwareSettings;
    if (f.hasOwnProperty("KeepAliveInterval") && f.KeepAliveInterval > 1000) {
      // noinspection JSCheckFunctionSignatures
      c.connection.serial.communicationTimeout = parseInt(f.KeepAliveInterval / 1000);
    }
    if (f.hasOwnProperty("baudrate")) c.connection.serial.baudrate = f.baudrate;
    if (f.hasOwnProperty("InputBuffer")) c.connection.serial.inputBufferSize = f.InputBuffer;
    if (f.hasOwnProperty("PrintlineCache")) c.movement.movebuffer = f.PrintlineCache;
    if (f.hasOwnProperty("maxXYSpeed")) c.movement.maxXYSpeed = f.maxXYSpeed;
    if (f.hasOwnProperty("xyJerk")) c.movement.xyJerk = f.xyJerk;
    if (f.hasOwnProperty("maxZSpeed")) c.movement.maxZSpeed = f.maxZSpeed;
    if (f.hasOwnProperty("zJerk")) {
      if (f.zJerk > 0) c.movement.zJerk = f.zJerk;else if (f.xyJerk > 0) c.movement.zJerk = f.xyJerk;
    }
    if (f.hasOwnProperty("xPrintAcceleration") && f.hasOwnProperty("yPrintAcceleration") && f.xPrintAcceleration === f.yPrintAcceleration) c.movement.xyPrintAcceleration = f.xPrintAcceleration;
    if (f.hasOwnProperty("xyPrintAcceleration")) c.movement.xyPrintAcceleration = f.xyPrintAcceleration;
    if (f.hasOwnProperty("xTravelAcceleration") && f.hasOwnProperty("yTravelAcceleration") && f.xTravelAcceleration === f.yTravelAcceleration) c.movement.xyTravelAcceleration = f.xTravelAcceleration;
    if (f.hasOwnProperty("xyTravelAcceleration")) c.movement.xyTravelAcceleration = f.xyTravelAcceleration;
    if (f.hasOwnProperty("zPrintAcceleration")) c.movement.zPrintAcceleration = f.zPrintAcceleration;
    if (f.hasOwnProperty("zTravelAcceleration")) c.movement.zTravelAcceleration = f.zTravelAcceleration;
    if (f.hasOwnProperty("ZLength")) c.movement.zMax = f.ZLength;
    if (f.hasOwnProperty("RetractionSpeed")) c.movement.G10Speed = f.RetractionSpeed;
    if (f.hasOwnProperty("RetractionLength")) c.movement.G10Distance = f.RetractionLength;
    if (f.hasOwnProperty("RetractionLongLength")) c.movement.G10LongDistance = f.RetractionLongLength;
    if (f.hasOwnProperty("RetractionUndoSpeed")) c.movement.G11Speed = f.RetractionUndoSpeed;
    if (f.hasOwnProperty("RetractionUndoExtraLength")) c.movement.G11ExtraDistance = f.RetractionUndoExtraLength;
    if (f.hasOwnProperty("RetractionUndoExtraLongLength")) c.movement.G11ExtraLongDistance = f.RetractionUndoExtraLongLength;
    if (f.hasOwnProperty("RetractionZLift")) c.movement.G10ZLift = f.RetractionZLift;
    if (f.hasOwnProperty("XHomePos")) c.movement.xHome = f.XHomePos;
    if (f.hasOwnProperty("YHomePos")) c.movement.yHome = f.YHomePos;
    if (f.hasOwnProperty("ZHomePos")) c.movement.zHome = f.ZHomePos;
    if (f.hasOwnProperty("ZMin")) {
      c.shape.basicShape.zMin = c.movement.zMin = f.ZMin;
      if (f.hasOwnProperty("ZLength")) c.shape.basicShape.zMax = c.movement.zMax = f.ZMin + f.ZLength;
    }
    if (f.hasOwnProperty("ZMax")) {
      c.shape.basicShape.zMax = c.movement.zMax = f.ZMax;
    }
    if (f.hasOwnProperty("printerType")) {
      c.general.printerVariant = "cartesian";
      if (f.printerType === 2) {
        c.general.printerVariant = "delta";
        c.shape.basicShape.shape = "circle";
        if (f.hasOwnProperty("printableRadius")) {
          c.shape.basicShape.radius = f.printableRadius;
          c.shape.basicShape.xMin = c.movement.xMin = -f.printableRadius;
          c.shape.basicShape.xMax = c.movement.xMax = f.printableRadius;
          c.shape.basicShape.yMin = c.movement.yMin = -f.printableRadius;
          c.shape.basicShape.yMax = c.movement.yMax = f.printableRadius;
        }
      }
      if (f.printerType === 1) {
        if (f.hasOwnProperty("XMin")) {
          c.shape.basicShape.xMin = c.movement.xMin = f.XMin;
          if (f.hasOwnProperty("XLength")) c.shape.basicShape.xMax = c.movement.xMax = f.XMin + f.XLength;
        }
        if (f.hasOwnProperty("YMin")) {
          c.shape.basicShape.yMin = c.movement.yMin = f.YMin;
          if (f.hasOwnProperty("YLength")) c.shape.basicShape.yMax = c.movement.yMax = f.YMin + f.YLength;
        }
        if (f.hasOwnProperty("XMax")) {
          c.shape.basicShape.xMax = c.movement.xMax = f.XMax;
        }
        if (f.hasOwnProperty("YMax")) {
          c.shape.basicShape.yMax = c.movement.yMax = f.YMax;
        }
      }
    } else {
      // unknown printer type
      if (f.hasOwnProperty("XMin")) {
        c.shape.basicShape.xMin = c.movement.xMin = f.XMin;
        if (f.hasOwnProperty("XLength")) c.shape.basicShape.xMax = c.movement.xMax = f.XMin + f.XLength;
      }
      if (f.hasOwnProperty("YMin")) {
        c.shape.basicShape.yMin = c.movement.yMin = f.YMin;
        if (f.hasOwnProperty("YLength")) c.shape.basicShape.yMax = c.movement.yMax = f.YMin + f.YLength;
      }
      if (f.hasOwnProperty("ZMin")) {
        c.shape.basicShape.zMin = c.movement.zMin = f.ZMin;
        if (f.hasOwnProperty("ZLength")) c.shape.basicShape.zMax = c.movement.zMax = f.ZMin + f.ZLength;
      }
      if (f.hasOwnProperty("XMax")) {
        c.shape.basicShape.xMax = c.movement.xMax = f.XMax;
      }
      if (f.hasOwnProperty("YMax")) {
        c.shape.basicShape.yMax = c.movement.yMax = f.YMax;
      }
      if (f.hasOwnProperty("ZMax")) {
        c.shape.basicShape.zMax = c.movement.zMax = f.ZMax;
      }
    }
    if (f.hasOwnProperty("BedXMin")) {
      c.shape.basicShape.xMin = f.BedXMin;
    }
    if (f.hasOwnProperty("BedYMin")) {
      c.shape.basicShape.yMin = f.BedYMin;
    }
    if (f.hasOwnProperty("BedXMax")) {
      c.shape.basicShape.xMax = f.BedXMax;
    }
    if (f.hasOwnProperty("BedYMax")) {
      c.shape.basicShape.yMax = f.BedYMax;
    }
    if (f.hasOwnProperty("hasHeatedBed") && c.heatedBeds.length === 0) {
      c.heatedBeds.push({
        heatupPerSecond: 0.1,
        lastTemp: 0,
        maxTemp: 110,
        cooldownPerSecond: 0.1,
        temperatures: []
      });
    }
    if (f.hasOwnProperty("hasHeatedChamber") && c.heatedChambers.length === 0) {
      c.heatedChambers.push({
        heatupPerSecond: 0.1,
        lastTemp: 0,
        maxTemp: 110,
        cooldownPerSecond: 0.1,
        temperatures: []
      });
    }
    if (f.hasOwnProperty("maxBedTemp")) c.heatedBeds[0].maxTemp = f.maxBedTemp;
    if (f.hasOwnProperty("maxChamberTemp")) c.heatedChambers[0].maxTemp = f.maxChamberTemp;
    if (f.hasOwnProperty("sdInstalled")) c.general.sdcard = Boolean(f.sdInstalled);
    if (f.hasOwnProperty("minFansInstalled")) c.general.numFans = Math.max(c.general.numFans, f.minFansInstalled);
    if (f.hasOwnProperty("fansInstalled")) c.general.numFans = f.fansInstalled;
    if (f.hasOwnProperty("softwarePowerSwitch")) c.general.softwarePower = Boolean(f.softwarePowerSwitch);
    if (f.hasOwnProperty("CaseLights")) c.general.softwareLight = Boolean(f.CaseLights);
    angular.forEach(c.extruders, function (ex, idx) {
      var app = "[" + idx + "]";
      if (f.hasOwnProperty("extrJerk" + app)) ex.eJerk = f["extrJerk" + app];
      if (f.hasOwnProperty("extrMaxSpeed" + app)) ex.maxSpeed = f["extrMaxSpeed" + app];
      if (f.hasOwnProperty("extrMaxTemp" + app)) ex.maxTemp = f["extrMaxTemp" + app];
      if (f.hasOwnProperty("extrAcceleration" + app)) ex.acceleration = f["extrAcceleration" + app];
    });
  };
  Service.readingFirmware = false;
  var firmwareSettingsPromise = null;
  var catchFirmwareSettings = function catchFirmwareSettings() {
    RSCom.send("getFirmwareSettings", {}).then(function (data) {
      // console.log('get settings:', data.settings)
      Service.firmwareSettings = data.settings;
      Service.hasFirmwareSettings = true;
      //log("New firmware settings", Service.firmwareSettings);
      setConfigFromFirmware();
      Service.readingFirmware = false;
      $rootScope.$broadcast("firmwareConfigRead", Service.firmwareSettings);
      if (firmwareSettingsPromise != null) {
        firmwareSettingsPromise.resolve(Service.firmwareSettings);
        firmwareSettingsPromise = null;
      }
    });
  };
  var awaitEepromData = false;
  var awaitEepromTimer = null;
  function disableEepromAwait() {
    awaitEepromData = false;
    awaitEepromTimer = null;
  }
  var enrichEepromClass = function enrichEepromClass(v) {
    var ok = true;
    var r = /^-?\d+$/;
    var f = /^-?\d+\.?\d*$/;
    var val;
    if (v.type === "0") {
      // byte
      if (r.exec(v.value) === null) {
        ok = false;
      } else {
        val = parseInt(v.value);
        ok = val > -128 && val < 256;
      }
    }
    if (v.type === "1") {
      // word
      if (r.exec(v.value) === null) {
        ok = false;
      } else {
        val = parseInt(v.value);
        ok = val > -32768 && val < 65536;
      }
    }
    if (v.type === "2") {
      // long
      if (r.exec(v.value) === null) {
        ok = false;
      } else {
        val = parseInt(v.value);
        ok = val > -2147483648 && val < 4294967296;
      }
    }
    if (v.type === "3") {
      // float
      if (f.exec(v.value) === null) {
        ok = false;
      }
    }
    if (ok) {
      if (v.value === v.valueOrig) v.class = "";else v.class = "has-success";
    } else v.class = "has-error";
    Service.eepromErrors = Service.eepromErrors || !ok;
  };
  Service.updateEepromErrors = function () {
    Service.eepromErrors = false;
    angular.forEach(Service.eepromData, function (v) {
      enrichEepromClass(v);
    });
  };
  $rootScope.$on("eepromClear", function (event, data) {
    if (data.printer === $rootScope.activeSlug) {
      Service.eepromData = [];
      awaitEepromData = true;
      if (awaitEepromTimer) window.clearTimeout(awaitEepromTimer);
      awaitEepromTimer = window.setTimeout(disableEepromAwait, 1000);
    }
  });
  $rootScope.$on("eepromData", function (event, data) {
    if (data.printer === $rootScope.activeSlug) {
      if (!awaitEepromData) return;
      Service.eepromData = Service.eepromData.concat(data.data);
      Service.updateEepromErrors();
      if (awaitEepromTimer) window.clearTimeout(awaitEepromTimer);
      awaitEepromTimer = window.setTimeout(disableEepromAwait, 1000);
    }
  });
  $rootScope.$on("eepromImport", function (event, data) {
    if (data.printer === $rootScope.activeSlug) {
      angular.forEach(data.data.eeprom, function (eprNew) {
        angular.forEach(Service.eepromData, function (epr, idx2) {
          // if (eprNew.pos === epr.pos && eprNew.type === epr.type) {
          if (eprNew.text === epr.text && eprNew.type === epr.type) {
            Service.eepromData[idx2].value = eprNew.value;
          }
        });
      });
      Service.updateEepromErrors();
      Flash.success("<?php _('EEPROM data imported') ?>");
    }
  });
  Service.saveEeprom = function (event, data) {
    Service.updateEepromErrors();
    if (Service.eepromErrors) {
      return;
    }
    RSCom.send("setEeprom", {
      eeprom: Service.eepromData
    }).then(function () {
      angular.forEach(Service.eepromData, function (epr) {
        epr.valueOrig = epr.value;
      });
      Service.updateEepromErrors();
      Flash.success("<?php _('EEPROM data updated!') ?>", "", 3000);
    });
  };
  Service.eepromDescription = function (text) {
    var p = text.indexOf("[");
    if (p < 0) return text;
    return text.substr(0, p);
  };
  Service.eepromUnits = function (text) {
    var p = text.indexOf("[");
    if (p < 0) return "";
    var p2 = text.indexOf("]", p);
    if (p2 < 0) return "";
    return text.substring(p + 1, p2).replace("^2", "²").replace("^3", "³");
  };
  Service.exportEEPROM = function () {
    RSCom.send("storeEEPROMFile", {
      eeprom: Service.eepromData
    }).then(function () {
      window.open("/printer/eeprom/" + $rootScope.activeSlug + "?a=export&sess=" + encodeURIComponent(User.getSession()), "_self");
    });
  };
  Service.readEEPROM = function () {
    RSCom.send("getEeprom", {});
  };
  var updateNewPrinter = function updateNewPrinter() {
    Service.eepromLoaded = false;
    Service.eepromErrors = false;
    Service.eepromData = [];
    Service.hasFirmwareSettings = false;
    Service.firmwareSettings = [];
    RSCom.send("getFirmwareSettings", {}).then(function (data) {
      Service.firmwareSettings = data.settings;
      Service.hasFirmwareSettings = true;
      $rootScope.$broadcast("firmwareConfigRead", Service.firmwareSettings);
    });
  };
  Service.updateFirmwareAutoset = function () {
    $rootScope.$broadcast("firmwareConfigRead", Service.firmwareSettings);
  };
  Service.updateFirmwareSettings = function () {
    Service.readingFirmware = true;
    firmwareSettingsPromise = $q.defer();
    RSCom.send("startUpdateFirmwareSettings", {}).then(function () {
      $timeout(catchFirmwareSettings, 3000);
    });
    return firmwareSettingsPromise.promise;
  };
  Service.setExtruderTemperature = function (extr, temp) {
    RSCom.send("setExtruderTemperature", {
      temperature: temp,
      extruder: extr
    });
  };
  Service.setBedTemperature = function (temp, idx) {
    if (idx === undefined) {
      idx = 0;
    }
    RSCom.send("setBedTemperature", {
      temperature: temp,
      bedId: idx
    });
  };
  Service.setChamberTemperature = function (temp, idx) {
    if (idx === undefined) {
      idx = 0;
    }
    RSCom.send("setChamberTemperature", {
      temperature: temp,
      chamberId: idx
    });
  };
  Service.sendGCode = function (code) {
    RSCom.send("send", {
      cmd: code
    });
  };
  Service.disableAutostartNextPrint = function () {
    RSCom.send('setAutostart', {
      state: false
    });
  };
  Service.setAutostartNextPrint = function (enable) {
    if (enable) {
      Service.enableAutostartNextPrint();
    } else {
      Service.disableAutostartNextPrint();
    }
  };
  Service.enableAutostartNextPrint = function () {
    RSCom.send('setAutostart', {
      state: true
    });
  };
  Service.recomputeAllGCodeInfo = function () {
    RSCom.send("recomputeAllGCodeInfo", {});
  };
  Service.recomputeGCodeInfo = function (file) {
    RSCom.send("recomputeGCodeInfo", {
      id: file.id,
      list: file.list
    });
  };
  Service.sendQuickCommand = function (code) {
    RSCom.send("sendQuickCommand", {
      name: code
    });
  };
  Service.sendWizardCommand = function (code) {
    RSCom.send("sendWizardCommand", {
      uuid: code
    });
  };
  Service.power = function () {
    Service.sendGCode('@runButtonCommand togglePower');
  };
  Service.autolevel = function () {
    Confirm('<?php _("Auto Bed Leveling") ?>', '<?php _("Please ensure that the bed is free of obstacles.") ?>', '<?php _("Continue") ?>', '<?php _("Cancel") ?>', true).then(function () {
      Service.sendGCode('@runButtonCommand autolevel');
    });
  };
  Service.emergencyStop = function () {
    RSCom.send("emergencyStop", {});
  };
  Service.toggleShutdownAfterPrint = function () {
    RSCom.send("setShutdownAfterPrint", {
      shutdown: !$rootScope.active.state.shutdownAfterPrint
    });
  };
  Service.toggleFilterFan = function () {
    RSCom.send("setFilterFan", {
      filter: !$rootScope.active.state.filterFan
    });
  };
  Service.speedChange = function (diff) {
    $rootScope.active.state.speedMultiply = diff;
    RSCom.send("setSpeedMultiply", {
      speed: $rootScope.active.state.speedMultiply
    });
  };
  Service.flowChange = function (diff) {
    $rootScope.active.state.flowMultiply = diff;
    RSCom.send("setFlowMultiply", {
      speed: $rootScope.active.state.flowMultiply
    });
  };
  Service.setFanPercent = function (newSpeed, index) {
    RSCom.send("setFanSpeed", {
      speed: Math.round(newSpeed * 2.55),
      fanId: index
    });
  };
  Service.setFanOn = function (on, index) {
    $rootScope.active.state.fans[index].on = on;
    RSCom.send("setFanSpeed", {
      speed: Math.round($rootScope.active.state.fans[index].percent * 2.55),
      "on": on,
      fanId: index
    });
  };
  Service.toggleCaseLights = function () {
    Service.sendGCode('@runButtonCommand toggleLight');
  };
  Service.xMoveRel = function (x) {
    if ($rootScope.activeConfig.movement.invertX) x = -x;
    RSCom.send("move", {
      x: x,
      relative: true
    });
    RSOverview.updateStateNow();
  };
  Service.yMoveRel = function (y) {
    if ($rootScope.activeConfig.movement.invertY) y = -y;
    RSCom.send("move", {
      y: y,
      relative: true
    });
    RSOverview.updateStateNow();
  };
  Service.zMoveRel = function (z) {
    if ($rootScope.activeConfig.movement.invertZ) z = -z;
    RSCom.send("move", {
      z: z,
      relative: true
    });
    RSOverview.updateStateNow();
  };
  Service.eMoveRel = function (x, speed) {
    RSCom.send("move", {
      e: x,
      relative: true,
      speed: speed
    });
    RSOverview.updateStateNow();
  };
  Service.selectExtruder = function (extr) {
    // console.log('selectExtruder', extr)
    RSCom.send("send", {
      cmd: "T" + extr + "\nG92 E0"
    });
    $rootScope.active.state.activeExtruder = extr;
    RSOverview.updateStateNow();
  };
  Service.runScript = function (scriptName) {
    RSCom.send("runScript", {
      script: scriptName
    });
  };
  Service.activate = function () {
    RSCom.send("activate", {
      printer: slug
    });
  };
  Service.deactivate = function () {
    RSCom.send("deactivate", {
      printer: slug
    });
  };
  Service.stopPrint = function () {
    if ($rootScope.active.status.jobid) RSCom.send("stopJob", {
      id: $rootScope.active.status.jobid
    });
  };
  Service.pausePrint = function () {
    RSCom.send("send", {
      cmd: "@pause <?php _('User requested pause.') ?>"
    });
  };
  Service.unpausePrint = function () {
    RSCom.send("continueJob", {});
  };
  var toolNames = ["<?php _('Extruder') ?>", "<?php _('Milling head') ?>", "<?php _('Laser') ?>", "<?php _('Syringe') ?>", "<?php _('Heated Chamber') ?>"];
  var toolIcons = ["rs rs-extruder", "rs rs-mill", "rs rs-laser", "rs rs-syringe", "rs rs-chamber"];
  var toolDiameterName = ["<?php _('Nozzle diameter') ?>", "<?php _('Milling width') ?>", "<?php _('Laser diameter') ?>", "<?php _('Syringe diameter') ?>", "<?php _('Diameter') ?>"];
  Service.extruderName = function (idx) {
    if ($rootScope.activeConfig && $rootScope.activeConfig.extruders && idx >= 0 && idx < $rootScope.activeConfig.extruders.length) {
      var alias = $rootScope.activeConfig.extruders[idx].alias;
      if (alias) return alias;
      return toolNames[$rootScope.activeConfig.extruders[idx].toolType] + ' ' + (idx + 1);
    }
    return "<?php _('Extruder') ?> " + (idx + 1);
  };
  Service.extruderIcon = function (idx) {
    if ($rootScope.activeConfig && $rootScope.activeConfig.extruders && idx >= 0 && idx < $rootScope.activeConfig.extruders.length) {
      return toolIcons[$rootScope.activeConfig.extruders[idx].toolType];
    }
    return toolIcons[0];
  };
  Service.extruderDiameterName = function (idx) {
    if ($rootScope.activeConfig && $rootScope.activeConfig.extruders && idx >= 0 && idx < $rootScope.activeConfig.extruders.length) {
      return toolDiameterName[$rootScope.activeConfig.extruders[idx].toolType];
    }
    return toolDiameterName[0];
  };
  $rootScope.$on('printerSelected', updateNewPrinter);
  if ($rootScope.activeSlug) {
    updateNewPrinter();
  }
  return Service;
}]);
},{}],99:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
var _msgpackLite = _interopRequireDefault(require("msgpack-lite"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _regeneratorRuntime() { "use strict"; /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/facebook/regenerator/blob/main/LICENSE */ _regeneratorRuntime = function _regeneratorRuntime() { return exports; }; var exports = {}, Op = Object.prototype, hasOwn = Op.hasOwnProperty, defineProperty = Object.defineProperty || function (obj, key, desc) { obj[key] = desc.value; }, $Symbol = "function" == typeof Symbol ? Symbol : {}, iteratorSymbol = $Symbol.iterator || "@@iterator", asyncIteratorSymbol = $Symbol.asyncIterator || "@@asyncIterator", toStringTagSymbol = $Symbol.toStringTag || "@@toStringTag"; function define(obj, key, value) { return Object.defineProperty(obj, key, { value: value, enumerable: !0, configurable: !0, writable: !0 }), obj[key]; } try { define({}, ""); } catch (err) { define = function define(obj, key, value) { return obj[key] = value; }; } function wrap(innerFn, outerFn, self, tryLocsList) { var protoGenerator = outerFn && outerFn.prototype instanceof Generator ? outerFn : Generator, generator = Object.create(protoGenerator.prototype), context = new Context(tryLocsList || []); return defineProperty(generator, "_invoke", { value: makeInvokeMethod(innerFn, self, context) }), generator; } function tryCatch(fn, obj, arg) { try { return { type: "normal", arg: fn.call(obj, arg) }; } catch (err) { return { type: "throw", arg: err }; } } exports.wrap = wrap; var ContinueSentinel = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} var IteratorPrototype = {}; define(IteratorPrototype, iteratorSymbol, function () { return this; }); var getProto = Object.getPrototypeOf, NativeIteratorPrototype = getProto && getProto(getProto(values([]))); NativeIteratorPrototype && NativeIteratorPrototype !== Op && hasOwn.call(NativeIteratorPrototype, iteratorSymbol) && (IteratorPrototype = NativeIteratorPrototype); var Gp = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(IteratorPrototype); function defineIteratorMethods(prototype) { ["next", "throw", "return"].forEach(function (method) { define(prototype, method, function (arg) { return this._invoke(method, arg); }); }); } function AsyncIterator(generator, PromiseImpl) { function invoke(method, arg, resolve, reject) { var record = tryCatch(generator[method], generator, arg); if ("throw" !== record.type) { var result = record.arg, value = result.value; return value && "object" == _typeof(value) && hasOwn.call(value, "__await") ? PromiseImpl.resolve(value.__await).then(function (value) { invoke("next", value, resolve, reject); }, function (err) { invoke("throw", err, resolve, reject); }) : PromiseImpl.resolve(value).then(function (unwrapped) { result.value = unwrapped, resolve(result); }, function (error) { return invoke("throw", error, resolve, reject); }); } reject(record.arg); } var previousPromise; defineProperty(this, "_invoke", { value: function value(method, arg) { function callInvokeWithMethodAndArg() { return new PromiseImpl(function (resolve, reject) { invoke(method, arg, resolve, reject); }); } return previousPromise = previousPromise ? previousPromise.then(callInvokeWithMethodAndArg, callInvokeWithMethodAndArg) : callInvokeWithMethodAndArg(); } }); } function makeInvokeMethod(innerFn, self, context) { var state = "suspendedStart"; return function (method, arg) { if ("executing" === state) throw new Error("Generator is already running"); if ("completed" === state) { if ("throw" === method) throw arg; return doneResult(); } for (context.method = method, context.arg = arg;;) { var delegate = context.delegate; if (delegate) { var delegateResult = maybeInvokeDelegate(delegate, context); if (delegateResult) { if (delegateResult === ContinueSentinel) continue; return delegateResult; } } if ("next" === context.method) context.sent = context._sent = context.arg;else if ("throw" === context.method) { if ("suspendedStart" === state) throw state = "completed", context.arg; context.dispatchException(context.arg); } else "return" === context.method && context.abrupt("return", context.arg); state = "executing"; var record = tryCatch(innerFn, self, context); if ("normal" === record.type) { if (state = context.done ? "completed" : "suspendedYield", record.arg === ContinueSentinel) continue; return { value: record.arg, done: context.done }; } "throw" === record.type && (state = "completed", context.method = "throw", context.arg = record.arg); } }; } function maybeInvokeDelegate(delegate, context) { var methodName = context.method, method = delegate.iterator[methodName]; if (undefined === method) return context.delegate = null, "throw" === methodName && delegate.iterator.return && (context.method = "return", context.arg = undefined, maybeInvokeDelegate(delegate, context), "throw" === context.method) || "return" !== methodName && (context.method = "throw", context.arg = new TypeError("The iterator does not provide a '" + methodName + "' method")), ContinueSentinel; var record = tryCatch(method, delegate.iterator, context.arg); if ("throw" === record.type) return context.method = "throw", context.arg = record.arg, context.delegate = null, ContinueSentinel; var info = record.arg; return info ? info.done ? (context[delegate.resultName] = info.value, context.next = delegate.nextLoc, "return" !== context.method && (context.method = "next", context.arg = undefined), context.delegate = null, ContinueSentinel) : info : (context.method = "throw", context.arg = new TypeError("iterator result is not an object"), context.delegate = null, ContinueSentinel); } function pushTryEntry(locs) { var entry = { tryLoc: locs[0] }; 1 in locs && (entry.catchLoc = locs[1]), 2 in locs && (entry.finallyLoc = locs[2], entry.afterLoc = locs[3]), this.tryEntries.push(entry); } function resetTryEntry(entry) { var record = entry.completion || {}; record.type = "normal", delete record.arg, entry.completion = record; } function Context(tryLocsList) { this.tryEntries = [{ tryLoc: "root" }], tryLocsList.forEach(pushTryEntry, this), this.reset(!0); } function values(iterable) { if (iterable) { var iteratorMethod = iterable[iteratorSymbol]; if (iteratorMethod) return iteratorMethod.call(iterable); if ("function" == typeof iterable.next) return iterable; if (!isNaN(iterable.length)) { var i = -1, next = function next() { for (; ++i < iterable.length;) if (hasOwn.call(iterable, i)) return next.value = iterable[i], next.done = !1, next; return next.value = undefined, next.done = !0, next; }; return next.next = next; } } return { next: doneResult }; } function doneResult() { return { value: undefined, done: !0 }; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, defineProperty(Gp, "constructor", { value: GeneratorFunctionPrototype, configurable: !0 }), defineProperty(GeneratorFunctionPrototype, "constructor", { value: GeneratorFunction, configurable: !0 }), GeneratorFunction.displayName = define(GeneratorFunctionPrototype, toStringTagSymbol, "GeneratorFunction"), exports.isGeneratorFunction = function (genFun) { var ctor = "function" == typeof genFun && genFun.constructor; return !!ctor && (ctor === GeneratorFunction || "GeneratorFunction" === (ctor.displayName || ctor.name)); }, exports.mark = function (genFun) { return Object.setPrototypeOf ? Object.setPrototypeOf(genFun, GeneratorFunctionPrototype) : (genFun.__proto__ = GeneratorFunctionPrototype, define(genFun, toStringTagSymbol, "GeneratorFunction")), genFun.prototype = Object.create(Gp), genFun; }, exports.awrap = function (arg) { return { __await: arg }; }, defineIteratorMethods(AsyncIterator.prototype), define(AsyncIterator.prototype, asyncIteratorSymbol, function () { return this; }), exports.AsyncIterator = AsyncIterator, exports.async = function (innerFn, outerFn, self, tryLocsList, PromiseImpl) { void 0 === PromiseImpl && (PromiseImpl = Promise); var iter = new AsyncIterator(wrap(innerFn, outerFn, self, tryLocsList), PromiseImpl); return exports.isGeneratorFunction(outerFn) ? iter : iter.next().then(function (result) { return result.done ? result.value : iter.next(); }); }, defineIteratorMethods(Gp), define(Gp, toStringTagSymbol, "Generator"), define(Gp, iteratorSymbol, function () { return this; }), define(Gp, "toString", function () { return "[object Generator]"; }), exports.keys = function (val) { var object = Object(val), keys = []; for (var key in object) keys.push(key); return keys.reverse(), function next() { for (; keys.length;) { var key = keys.pop(); if (key in object) return next.value = key, next.done = !1, next; } return next.done = !0, next; }; }, exports.values = values, Context.prototype = { constructor: Context, reset: function reset(skipTempReset) { if (this.prev = 0, this.next = 0, this.sent = this._sent = undefined, this.done = !1, this.delegate = null, this.method = "next", this.arg = undefined, this.tryEntries.forEach(resetTryEntry), !skipTempReset) for (var name in this) "t" === name.charAt(0) && hasOwn.call(this, name) && !isNaN(+name.slice(1)) && (this[name] = undefined); }, stop: function stop() { this.done = !0; var rootRecord = this.tryEntries[0].completion; if ("throw" === rootRecord.type) throw rootRecord.arg; return this.rval; }, dispatchException: function dispatchException(exception) { if (this.done) throw exception; var context = this; function handle(loc, caught) { return record.type = "throw", record.arg = exception, context.next = loc, caught && (context.method = "next", context.arg = undefined), !!caught; } for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i], record = entry.completion; if ("root" === entry.tryLoc) return handle("end"); if (entry.tryLoc <= this.prev) { var hasCatch = hasOwn.call(entry, "catchLoc"), hasFinally = hasOwn.call(entry, "finallyLoc"); if (hasCatch && hasFinally) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } else if (hasCatch) { if (this.prev < entry.catchLoc) return handle(entry.catchLoc, !0); } else { if (!hasFinally) throw new Error("try statement without catch or finally"); if (this.prev < entry.finallyLoc) return handle(entry.finallyLoc); } } } }, abrupt: function abrupt(type, arg) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc <= this.prev && hasOwn.call(entry, "finallyLoc") && this.prev < entry.finallyLoc) { var finallyEntry = entry; break; } } finallyEntry && ("break" === type || "continue" === type) && finallyEntry.tryLoc <= arg && arg <= finallyEntry.finallyLoc && (finallyEntry = null); var record = finallyEntry ? finallyEntry.completion : {}; return record.type = type, record.arg = arg, finallyEntry ? (this.method = "next", this.next = finallyEntry.finallyLoc, ContinueSentinel) : this.complete(record); }, complete: function complete(record, afterLoc) { if ("throw" === record.type) throw record.arg; return "break" === record.type || "continue" === record.type ? this.next = record.arg : "return" === record.type ? (this.rval = this.arg = record.arg, this.method = "return", this.next = "end") : "normal" === record.type && afterLoc && (this.next = afterLoc), ContinueSentinel; }, finish: function finish(finallyLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.finallyLoc === finallyLoc) return this.complete(entry.completion, entry.afterLoc), resetTryEntry(entry), ContinueSentinel; } }, catch: function _catch(tryLoc) { for (var i = this.tryEntries.length - 1; i >= 0; --i) { var entry = this.tryEntries[i]; if (entry.tryLoc === tryLoc) { var record = entry.completion; if ("throw" === record.type) { var thrown = record.arg; resetTryEntry(entry); } return thrown; } } throw new Error("illegal catch attempt"); }, delegateYield: function delegateYield(iterable, resultName, nextLoc) { return this.delegate = { iterator: values(iterable), resultName: resultName, nextLoc: nextLoc }, "next" === this.method && (this.arg = undefined), ContinueSentinel; } }, exports; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
RSBase.factory('RSPrinters', ['$q', 'RSPrinter', '$rootScope', '$uibModal', 'RSOverview', 'Confirm', 'RSCom', 'Flash', '$state', 'Info', function ($q, RSPrinter, $rootScope, $uibModal, RSOverview, Confirm, RSCom, Flash, $state, Info) {
  var Service = {};
  if (!$rootScope.globals) $rootScope.globals = {};
  Service.globals = $rootScope.globals;
  Service.addPrinter = function () {
    $uibModal.open({
      templateUrl: '/views/printer/dialog/addPrinter.php?lang=' + lang,
      controller: ['$scope', '$uibModalInstance', 'RSCom', function ($scope, $uibModalInstance, RSCom) {
        $scope.newprinter = {
          name: '',
          slug: ''
        };
        $scope.createPrinter = function () {
          $scope.newprinter.errors = {};
          if ($scope.newprinter.name.length === 0) $scope.newprinter.errors.name = "<?php _('No printer name given.') ?>";
          if (!$scope.newprinter.slug.match(/^[a-zA-Z0-9]+$/)) $scope.newprinter.errors.slug = "<?php _('Only a-z, A-Z and 0-9 are allowed.') ?>";
          if (typeof $rootScope.printerConfig[$scope.newprinter.slug] !== 'undefined') $scope.newprinter.errors.slug = "<?php _('Slug name already in use.') ?>";
          if (Object.keys($scope.newprinter.errors).length > 0) return;
          RSCom.send('createConfiguration', $scope.newprinter).then(function () {
            $uibModalInstance.close();
          });
        };
        $scope.close = function () {
          $uibModalInstance.dismiss();
        };
      }]
    }).result.catch(function (res) {});
  };
  Service.backupPrinter = function (printer) {
    $uibModal.open({
      templateUrl: '/views/printer/dialog/backupPrinter.php?lang=' + lang,
      controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
        $scope.printerSlug = printer.slug;
        $scope.backupJobs = false;
        $scope.backupModels = false;
        $scope.backupConfig = true;
        $scope.backupTimelapse = false;
        $scope.restoreId = -1;
        $scope.backupLogs = false;
        $scope.folderSizes = {
          logs: {
            count: 0,
            size: 0
          },
          jobs: {
            entryCount: 0,
            count: 0,
            size: 0,
            countFiltered: 0
          },
          models: {
            entryCount: 0,
            count: 0,
            size: 0,
            countFiltered: 0
          },
          timelapse: {
            entryCount: 0,
            count: 0,
            size: 0,
            countFiltered: 0
          }
        };
        $scope.getBackupRequestLink = function () {
          return "/printer/pconfig/" + $scope.printerSlug + "?a=download&sess=" + $rootScope.user.getSessionEncoded() + "&exportModels=" + $scope.backupModels + "&exportJobs=" + $scope.backupJobs + "&exportLogs=" + $scope.backupLogs + "&exportConfig=" + $scope.backupConfig + "&exportTimelapse=" + $scope.backupTimelapse;
        };
        $scope.fetchFolderSize = function () {
          console.log($scope.printerSlug);
          return new Promise(function (resolve, reject) {
            RSCom.send("getPrinterFolderInfo", {}, $scope.printerSlug).then(function (result) {
              if (result.ok) {
                resolve(result.data);
              } else {
                reject(result);
              }
            });
          });
        };
        $scope.getFolderSizes = /*#__PURE__*/_asyncToGenerator( /*#__PURE__*/_regeneratorRuntime().mark(function _callee() {
          return _regeneratorRuntime().wrap(function _callee$(_context) {
            while (1) switch (_context.prev = _context.next) {
              case 0:
                $scope.folderSizes = {
                  logs: {
                    count: 0,
                    size: 0,
                    countFiltered: 0
                  },
                  jobs: {
                    entryCount: 0,
                    count: 0,
                    size: 0,
                    countFiltered: 0
                  },
                  models: {
                    entryCount: 0,
                    count: 0,
                    size: 0,
                    countFiltered: 0
                  },
                  timelapse: {
                    entryCount: 0,
                    count: 0,
                    size: 0,
                    countFiltered: 0
                  }
                };
                _context.next = 3;
                return $scope.fetchFolderSize();
              case 3:
                $scope.folderSizes = _context.sent;
              case 4:
              case "end":
                return _context.stop();
            }
          }, _callee);
        }));
        $scope.getFolderSizes();
        $scope.toggleSelectAll = function () {
          if ($scope.folderSizes.jobs.countFiltered) {
            $scope.backupJobs = $scope.selectAll;
          }
          if ($scope.folderSizes.models.countFiltered) {
            $scope.backupModels = $scope.selectAll;
          }
          if ($scope.folderSizes.timelapse.countFiltered) {
            $scope.backupTimelapse = $scope.selectAll;
          }
          if ($scope.folderSizes.logs.count) {
            $scope.backupLogs = $scope.selectAll;
          }
          $scope.backupConfig = $scope.selectAll;
        };
        $scope.close = function () {
          $uibModalInstance.dismiss();
        };
      }]
    }).result.catch(function (res) {});
  };
  Service.uploadPrinter = function (printer) {
    $uibModal.open({
      templateUrl: '/views/printer/dialog/uploadPrinter.php?lang=' + lang,
      backdrop: 'static',
      controller: ['$scope', '$uibModalInstance', function ($scope, $uibModalInstance) {
        $scope.confupload = printer ? {
          mode: 0,
          name: printer.name,
          slug: printer.slug
        } : {
          mode: 1,
          name: '',
          overwriteConnection: false,
          slug: ''
        };
        var uploadSize = 100;
        $scope.ports = [];
        $scope.menuPort = false;
        $scope.getRestoreRequestUrl = function () {
          if (printer) {
            return "/printer/pconfig/" + printer.slug + "/";
          } else {
            return "/printer/pconfig/";
          }
        };
        $scope.getPorts = function () {
          RSCom.send('listPorts', {}).then(function (data) {
            $scope.ports = data;
          });
        };
        $scope.getPorts();
        $scope.confOptions = {
          format: 0,
          printerName: "",
          connectionMethod: 0,
          serialPort: "",
          pipe: "",
          ipAdr: "",
          ipPort: 0,
          jobs: {
            available: false,
            restore: false,
            size: 0,
            count: 0,
            countFiltered: 0
          },
          models: {
            available: false,
            restore: false,
            size: 0,
            count: 0,
            countFiltered: 0
          },
          timelapses: {
            available: false,
            restore: false,
            size: 0,
            count: 0,
            countFiltered: 0
          },
          logs: {
            available: false,
            restore: false,
            size: 0,
            count: 0,
            countFiltered: 0
          },
          config: {
            available: false,
            restore: false,
            size: 0,
            count: 0,
            countFiltered: 0
          }
        };
        $scope.selectAll = false;
        $scope.selectedfilename = "";
        $scope.uploadConfigProgress = 0;
        $scope.restoreProgress = 0;
        $scope.diskUsage = {
          capacity: 0,
          available: 0
        };
        $scope.spaceNeeded = 0;
        $scope.toggleSelectAll = function () {
          if ($scope.confOptions.jobs.available) {
            $scope.confOptions.jobs.restore = $scope.selectAll;
          }
          if ($scope.confOptions.models.available) {
            $scope.confOptions.models.restore = $scope.selectAll;
          }
          if ($scope.confOptions.timelapses.available) {
            $scope.confOptions.timelapses.restore = $scope.selectAll;
          }
          if ($scope.confOptions.logs.available) {
            $scope.confOptions.logs.restore = $scope.selectAll;
          }
          if ($scope.confOptions.config.available && $scope.confupload.mode !== 1) {
            $scope.confOptions.config.restore = $scope.selectAll;
          }
        };
        $scope.checkDiskSpaceForRestore = function () {
          if ($('#confuploadbutton')[0].files[0] !== undefined) {
            uploadSize = $('#confuploadbutton')[0].files[0].size;
            var totalRestoreSize = 0;
            angular.forEach($scope.confOptions, function (item) {
              if (item.restore) {
                totalRestoreSize += item.size;
              }
            });
            $scope.spaceNeeded = $scope.diskUsage.available - (totalRestoreSize + uploadSize + 100 * 1024 * 1024);
            // console.log("Space needed:", $scope.spaceNeeded, $scope.diskUsage.capacity, $scope.diskUsage.available, totalRestoreSize, uploadSize )
            return $scope.spaceNeeded > 0;
          } else {
            return false;
          }
        };
        $scope.analyzeRPCFile = function () {
          RSCom.send('freeSpace', {}).then(function (d) {
            $scope.diskUsage = d;
          });
          $scope.confOptions = {
            format: 0,
            printerName: "",
            connectionMethod: 0,
            serialPort: "",
            pipe: "",
            ipAdr: "",
            ipPort: 0,
            jobs: {
              available: false,
              restore: false,
              size: 0,
              count: 0,
              countFiltered: 0
            },
            models: {
              available: false,
              restore: false,
              size: 0,
              count: 0,
              countFiltered: 0
            },
            timelapses: {
              available: false,
              restore: false,
              size: 0,
              count: 0,
              countFiltered: 0
            },
            logs: {
              available: false,
              restore: false,
              size: 0,
              count: 0,
              countFiltered: 0
            },
            config: {
              available: false,
              restore: false,
              size: 0,
              count: 0,
              countFiltered: 0
            }
          };
          var rpcFile = $('#confuploadbutton')[0].files[0];
          var deferred = $q.defer();
          var readerFlag = new FileReader();
          readerFlag.onload = function (e) {
            var fileFlag = new DataView(readerFlag.result);
            var fileFlagString = "";
            for (var i = 0; i !== 3; i++) {
              fileFlagString += String.fromCharCode(fileFlag.getUint8(i));
            }
            if (fileFlagString === "<?x") {
              $scope.confOptions.format = 1;
              return;
            }
            if (fileFlagString === 'rpc') {
              $scope.confOptions.format = 2;
              var readerLengthReader = new FileReader();
              readerLengthReader.onerror = deferred.reject.bind(deferred);
              readerLengthReader.onload = function (e) {
                var dataHeaderLength = new DataView(readerLengthReader.result);
                var headerSize = dataHeaderLength.getUint32(0, true);
                var reader = new FileReader();
                reader.onerror = deferred.reject.bind(deferred);
                reader.onload = function (e) {
                  if (!reader.result) {
                    deferred.reject(new Error("Unknown error"));
                    return;
                  }
                  var text = new Uint8Array(reader.result);
                  var decoded = _msgpackLite.default.decode(text);
                  var addData = function addData(obj, bitmaskNum, keyPraefix) {
                    obj.available = (decoded["c"] & bitmaskNum) === bitmaskNum;
                    obj.count = obj.available ? decoded[keyPraefix + "c"] : 0;
                    obj.countFiltered = obj.available ? decoded[keyPraefix + "cf"] : 0;
                    obj.size = obj.available ? decoded[keyPraefix + "s"] : 0;
                  };
                  if (decoded) {
                    $scope.confupload.restoreData = true;
                    $scope.confupload.name = decoded["pn"];
                    $scope.confOptions.connectionMethod = decoded["cm"];
                    switch ($scope.confOptions.connectionMethod) {
                      case 0:
                        $scope.confOptions.serialPort = decoded["pc"];
                        break;
                      case 1:
                        $scope.confOptions.pipe = decoded["pc"];
                        break;
                      case 2:
                        $scope.confOptions.ipAdr = decoded["pIpAdr"];
                        $scope.confOptions.ipPort = decoded["pIpPort"];
                        break;
                      case 3:
                        $scope.confOptions.pipe = decoded["pc"];
                        break;
                    }
                    addData($scope.confOptions.config, 16, "c");
                    addData($scope.confOptions.logs, 8, "l");
                    addData($scope.confOptions.jobs, 4, "j");
                    addData($scope.confOptions.models, 2, "m");
                    addData($scope.confOptions.timelapses, 1, "t");
                  }
                };
                var rpcFileHeader = rpcFile.slice(7, headerSize + 7);
                reader.readAsArrayBuffer(rpcFileHeader);
              };
              var rpcHeaderLengthIndicator = rpcFile.slice(3, 7);
              readerLengthReader.readAsArrayBuffer(rpcHeaderLengthIndicator);
            } else {
              $scope.confOptions.format = 3;
            }
          };
          var rpcHeaderFlag = rpcFile.slice(0, 3);
          readerFlag.readAsArrayBuffer(rpcHeaderFlag);
          $scope.checkDiskSpaceForRestore();
          return deferred.promise;
        };
        $scope.newPrinter = function () {
          window.open("#!/configWizard", "_self");
          $uibModalInstance.dismiss();
        };
        $scope.createPrinterFromConfig = function () {
          $scope.confupload.errors = {};
          $scope.selectfilename = '';
          RSCom.extendPing(600);
          /*if (!$scope.confupload.slug.match(/^[a-zA-Z0-9]*$/))
           $scope.confupload.errors.slug = "<?php _('Only a-z, A-Z and 0-9 are allowed.') ?>";
           if ($scope.confupload.mode == 1 && typeof($rootScope.printerConfig[$scope.confupload.slug]) != 'undefined')
           $scope.confupload.errors.slug = "<?php _('Slug name already in use.') ?>";*/
          if (Object.keys($scope.confupload.errors).length > 0) return;
          $('#formuploadconfig').ajaxSubmit({
            success: function success(r) {
              //Flash.success("<?php _('Upload finished') ?>")
              //$scope.uploadConfigProgress = 0;
              r = angular.fromJson(r);
              $scope.restoreId = r.id;
            },
            uploadProgress: function uploadProgress(evt, pos, total, percent) {
              $scope.uploadConfigProgress = percent;
            }
          });
        };
        $scope.$on('restoreFinished', function (event, data) {
          if ($scope.restoreId === data.data.id) {
            $scope.uploadConfigProgress = 0;
            $scope.restoreProgress = 0;
            RSCom.extendPing(0); // Reset default timeout
            $uibModalInstance.close();
            if (data.data.error) {
              $scope.confupload.errors.createerror = data.data.error;
              Flash.error("<?php _('Upload failed: ') ?>" + data.data.error);
              $uibModalInstance.close();
            } else {
              Flash.success("<?php _('Upload finished') ?>");
            }
          }
        });
        $scope.$on('restoreProgress', function (event, data) {
          // console.log(data.data)
          $scope.restoreProgress = Math.round(data.data / uploadSize * 100);
        });
        $scope.close = function () {
          if ($scope.uploadConfigProgress === 0) {
            $uibModalInstance.dismiss();
          }
        };
        $scope.canUpload = function () {
          var fileName = $('#confuploadbutton').val();
          $scope.selectfilename = fileName.replace(/\\/g, '/').replace(/.*\//, '');
          $scope.confupload.slug = printer ? printer.slug : Service.autocreateSlug($scope.confupload.name);
          var ok = fileName && fileName.length > 4 && (fileName.lastIndexOf('.rpc') === fileName.length - 4 || fileName.lastIndexOf('.xml') === fileName.length - 4);
          ok &= /*$scope.confupload.slug.length > 0 &&*/$scope.confupload.name.length > 0;
          return $scope.checkDiskSpaceForRestore() && ok && ($scope.confupload.mode !== 1 || !($scope.confupload.mode === 1 && $scope.confOptions.format === 2 && !$scope.confOptions.config.available));
        };
      }]
    }).result.catch(function (res) {});
  };
  Service.removePrinter = function (p) {
    RSCom.send('getKlipperStatus', {}).then(function (data) {
      if (data.installations.includes(p.slug)) {
        Info("<?php _('Operation not permitted') ?>", "<?php _('You have a klipper installation for this printer. Please uninstall the klipper installation first!') ?>").then(function () {
          $state.go('printer.klipperConfig', {
            slug: p.slug
          });
        });
      } else {
        Confirm("<?php _('Confirmation required') ?>", "<?php _('Really delete printer setup for #1 and all associated g-code files?') ?>".replace('#1', p.name + ''), null, null, true).then(function () {
          RSCom.send('removeConfiguration', {
            slug: p.slug
          }).then(function () {
            delete $rootScope.printerConfig[p.slug];
            delete $rootScope.printer[p.slug];
            Flash.success("<?php _('Printer deleted') ?>");
            $state.go('home');
          });
        }, function () {});
      }
    }, function () {});
  };
  Service.emergencyStop = function (p) {
    RSCom.send("emergencyStop", {}, p.slug);
  };
  Service.stopPrint = function (p) {
    if ($rootScope.active.status.jobid) RSCom.send("stopJob", {
      id: $rootScope.active.status.jobid
    }, p.slug);
  };
  Service.pausePrint = function (p) {
    RSCom.send("send", {
      cmd: "@pause <?php _('User requested pause.') ?>"
    }, p.slug);
  };
  Service.unpausePrint = function (p) {
    console.log('unpause', p.slug);
    RSCom.send("continueJob", {}, p.slug);
  };
  Service.activate = function (p) {
    RSCom.send('activate', {
      printer: p.slug
    }).then(function () {
      Flash.success("<?php _('Printer activated') ?>");
    });
  };
  Service.deactivate = function (p) {
    RSCom.send('deactivate', {
      printer: p.slug
    }).then(function () {
      Flash.success("<?php _('Printer deactivated') ?>");
    });
  };
  var isDigit = function isDigit(c) {
    return c >= '0' && c <= '9';
  };
  Service.doesSlugExist = function (testSlug) {
    return typeof $rootScope.printerConfig[testSlug] !== 'undefined';
  };
  Service.autocreateSlug = function (name) {
    var newSlug = '';
    var i = 0,
      len = name.length;
    for (; i < len; i++) {
      var c = name[i];
      if (c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c === '_') newSlug += c;else if (c === ' ') newSlug += '_';
    }
    var snum = '';
    while (newSlug.length > 0 && isDigit(newSlug[newSlug.length - 1])) {
      snum = newSlug[newSlug.length - 1] + snum;
      newSlug = newSlug.substr(0, newSlug.length - 1);
    }
    while (Service.doesSlugExist(newSlug + snum)) {
      if (snum.length === 0) snum = '0';
      snum = (parseInt(snum) + 1).toString();
    }
    return newSlug + snum;
  };
  Service.printersUsingPort = function (port, exceptSlug) {
    function statusOfSlug(slug) {
      var status = '';
      angular.forEach($rootScope.printerList, function (p) {
        if (p.slug === slug) {
          if (p.active) {
            if (p.online === 1) {
              status = " (<?php _('Online') ?>)";
            } else if (p.online === 2) {
              status = " (<?php _('Connected') ?>)";
            } else {
              status = " (<?php _('Offline') ?>)";
            }
          } else {
            status = " (<?php _('Deactivated') ?>)";
          }
        }
      });
      return status;
    }
    var a = [];
    angular.forEach($rootScope.printerConfig, function (val, key) {
      if (key === exceptSlug || !val.connection || !val.connection.serial || val.connection.connectionMethod !== 0) {
        return;
      }
      if (val.connection.serial.device !== port) {
        return;
      }
      if (val.connection.serial.device === 'VirtualCartesian' || val.connection.serial.device === 'VirtualDelta') {
        return;
      }
      a.push('<li>' + val.general.name + statusOfSlug(key) + '</li>');
    });
    if (a.length === 0) {
      return false;
    }
    return '<ul>' + a.join('') + '</ul>';
  };
  $rootScope.RSPrinters = Service;
  return Service;
}]);
},{"msgpack-lite":39}],100:[function(require,module,exports){
"use strict";

var _basicDirectives = require("./basicDirectives");
/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

RSBase.controller('PushMessageController', ['$scope', '$rootScope', 'RSCom', 'GSettings', 'RSGS', 'Flash', function ($scope, $rootScope, RSCom, GSettings, RSGS, Flash) {
  $scope.textThirdParty = "<?php _('Here you can enter your external push service API link to push a message. Please use the {{message}} placeholder for the text parameter. For an example with CallMeBot see: ') ?>";
  $scope.groupId = $rootScope.serverSettings.g_push_group;
  var lastLoadedGroupId = $rootScope.serverSettings.g_push_group;
  $scope.serverSettingsChanged = GSettings.serverSettingsChanged;
  $scope.timeout = 30;
  $rootScope.$watch("serverSettings.g_push_group", function (newData) {
    if (newData !== lastLoadedGroupId) {
      lastLoadedGroupId = $scope.groupId = newData;
    }
  });
  $rootScope.$watch("serverSettings.g_push_print_busy_timeout", function (newData) {
    $scope.timeout = newData;
  });
  $scope.$watch("timeout", function (newData) {
    if (newData) {
      if (newData >= 10) {
        $rootScope.serverSettings.g_push_print_busy_timeout = newData;
        GSettings.serverSettingsChanged();
      }
    }
  });
  function isGroupValid(group) {
    return group.length === 29;
  }
  function formatGroup(group) {
    group = (0, _basicDirectives.replaceAll)("-", "", group.toUpperCase()).trim();
    var ng = "";
    for (var i = 0; i < group.length; i++) {
      var c = group.charAt(i);
      if (c >= '0' && c <= '9' || c >= 'A' && c <= 'Z') ng += c;
    }
    group = ng.substr(0, 25);
    ng = "";
    while (group.length > 0) {
      ng += group.substr(0, 5);
      if (group.length > 5) {
        ng += "-";
        group = group.substr(5);
      } else group = "";
    }
    return ng;
  }
  $scope.$watch('groupId', function (newVal) {
    if (typeof newVal === 'undefined') return;
    var cor = formatGroup(newVal);
    // noinspection JSIncompatibleTypesComparison
    if (cor !== newVal) {
      $scope.groupId = cor;
    }
    if (isGroupValid(cor)) {
      $rootScope.serverSettings.g_push_group = cor;
      GSettings.serverSettingsChanged();
    }
  });
  $scope.sendTestMessage = function (service) {
    var command = service === "repetierInformer" ? "testPushMessage" : "";
    command = service === "pushover" ? "testPushoverPushMessage" : command;
    command = service === "thirdParty" ? "testThirdPartyPushMessage" : command;
    RSCom.send(command, {}).then(function (data) {
      if (data.send) Flash.success("<?php _('Push message send') ?>");else Flash.error("<?php _('Failed to send push message') ?>");
    });
  };
}]);
},{"./basicDirectives":104}],101:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isMobile = void 0;
/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

window.RSUtils = {};
RSUtils.createAlphaID = function (chars) {
  var id = "";
  var allowedChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (var i = 0; i < chars; i++) id += allowedChars.charAt(Math.floor(Math.random() * allowedChars.length));
  return id;
};
Array.prototype.sortOn = function (key) {
  this.sort(function (a, b) {
    if (a[key] < b[key]) {
      return -1;
    } else if (a[key] > b[key]) {
      return 1;
    }
    return 0;
  });
};
if (!String.prototype.startsWith) {
  String.prototype.startsWith = function (searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) === position;
  };
}
function testMobile() {
  var hasTouchScreen = false;
  if ("maxTouchPoints" in navigator) {
    hasTouchScreen = navigator.maxTouchPoints > 0;
  } else if ("msMaxTouchPoints" in navigator) {
    hasTouchScreen = navigator.msMaxTouchPoints > 0;
  } else {
    var mQ = window.matchMedia && matchMedia("(pointer:coarse)");
    if (mQ && mQ.media === "(pointer:coarse)") {
      hasTouchScreen = !!mQ.matches;
    } else if ('orientation' in window) {
      hasTouchScreen = true; // deprecated, but good fallback
    } else {
      // Only as a last resort, fall back to user agent sniffing
      var UA = navigator.userAgent;
      hasTouchScreen = /\b(BlackBerry|webOS|iPhone|IEMobile)\b/i.test(UA) || /\b(Android|Windows Phone|iPad|iPod)\b/i.test(UA);
    }
  }
  return hasTouchScreen;
}
var isMobile = testMobile();
exports.isMobile = isMobile;
},{}],102:[function(require,module,exports){
"use strict";

var _basicDirectives = require("./basicDirectives");
/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

//noinspection JSUnusedLocalSymbols
var dummy = {
  errorMsg: undefined,
  licence: ''
};
RSBase.controller('UpdateController', ['$scope', '$rootScope', 'RSCom', 'Flash', 'GSettings', '$timeout', function ($scope, $rootScope, RSCom, Flash, GSettings, $timeout) {
  $scope.checkingUpdate = true;
  $scope.updateError = "";
  $scope.registerResult = "";
  $scope.isUpdating = false;
  $scope.licence = {
    licence: '',
    active: false,
    wantsBranding: false,
    hasBranding: false
  };
  var updateData = function updateData() {
    RSCom.send("getLicenceData", {}).then(function (lic) {
      $scope.licence = lic;
    });
  };
  function check() {
    RSCom.send('checkForUpdates', {}).then(function () {
      RSCom.updateImportant();
    });
    updateData();
  }
  check();
  $scope.$on('newUpdateLoaded', function () {
    $timeout(function () {
      $scope.checkingUpdate = false;
    }, 500);
  });
  $scope.autoupdate = function () {
    if ($scope.isUpdating) {
      return;
    }
    $scope.isUpdating = false;
    RSCom.send("autoupdate", {}).then(function (d) {
      $scope.isUpdating = true;
      $scope.updateError = d.error;
      if (d.error === "") {
        Flash.success("<?php _('Autoupdate started') ?>");
        if ($rootScope.serverSettings.ServerOS === 0 || $rootScope.serverSettings.ServerOS === 2) $scope.registerResult = "<?php _('Downloading and starting update. Display will reload when finished.') ?>";else $scope.registerResult = "<?php _('Downloading and starting update.') ?>";
      } else {
        $scope.isUpdating = false;
      }
    });
  };
  $scope.$on("connected", function () {
    if ($scope.isUpdating) {
      // noinspection JSDeprecatedSymbols
      location.reload(true);
    } else check();
  });
  $scope.startPeriod = function () {
    Flash.info("<?php _('Starting Trial Period') ?>");
    RSCom.send("setTestperiodMode", {
      mode: 2
    });
  };
}]);
RSBase.controller('RegisterController', ['$scope', '$rootScope', 'RSCom', 'Flash', function ($scope, $rootScope, RSCom, Flash) {
  $scope.update = {};
  $scope.licence = {
    licence: '',
    active: false,
    wantsBranding: false,
    hasBranding: false
  };
  $scope.upgradeLicense = "";
  $scope.upgradeLicenseValid = false;
  $scope.licenceValid = false;
  $scope.deactivated = false;
  $scope.licenceError = false;
  $scope.waitActivate = false;
  $scope.waitDeactivate = false;
  $scope.updateError = "";
  $scope.registerResult = "";
  $scope.isUpdating = false;
  var updateData = function updateData() {
    RSCom.updateImportant();
    RSCom.send("getLicenceData", {}).then(function (lic) {
      $scope.licence = lic;
      if ($scope.licence.wantsBranding && !$scope.licence.active) {
        // noinspection JSDeprecatedSymbols
        location.reload(true);
      }
    });
  };
  $scope.startPeriod = function () {
    Flash.info("<?php _('Starting Trial Period') ?>");
    RSCom.send("setTestperiodMode", {
      mode: 2
    });
  };
  $scope.$on("connected", function () {
    if ($scope.isUpdating) {
      // noinspection JSDeprecatedSymbols
      location.reload(true);
    } else updateData();
  });
  $scope.$on("autoupdateResponse", function (event, e) {
    if (e.data.code === 0) $scope.registerResult = e.data.response;else $scope.updateError = e.data.response;
    $scope.isUpdating = false;
  });
  function isLicenceValid(group) {
    return group.length === 29;
  }
  function formatGroup(group) {
    group = (0, _basicDirectives.replaceAll)("-", "", group.toUpperCase()).trim();
    var ng = "";
    for (var i = 0; i < group.length; i++) {
      var c = group.charAt(i);
      if (c >= '0' && c <= '9' || c >= 'A' && c <= 'Z') ng += c;
    }
    group = ng.substr(0, 25);
    ng = "";
    while (group.length > 0) {
      ng += group.substr(0, 5);
      if (group.length > 5) {
        ng += "-";
        group = group.substr(5);
      } else group = "";
    }
    return ng;
  }
  $scope.$watch('licence.licence', function (newVal) {
    if (typeof newVal == 'undefined') return;
    var cor = formatGroup(newVal);
    if (cor !== newVal) $scope.licence.licence = cor;
    $scope.licenceValid = isLicenceValid(cor);
  });
  $scope.$watch('upgradeLicense', function (newVal) {
    if (typeof newVal == 'undefined') return;
    var cor = formatGroup(newVal);
    if (cor !== newVal) $scope.upgradeLicense = cor;
    $scope.upgradeLicenseValid = isLicenceValid(cor);
  });
  $scope.activate = function () {
    $scope.waitActivate = true;
    RSCom.send("setLicenceData", {
      a: "activate",
      licence: $scope.licence.licence
    }).then(function (lic) {
      $scope.waitActivate = false;
      if (lic.success) {
        $scope.licence.active = true;
        $scope.deactivated = false;
        $scope.licenceError = false;
        // noinspection JSDeprecatedSymbols
        location.reload(true);
        updateData();
      } else {
        $scope.licenceError = lic.errorMsg;
      }
    });
  };
  $scope.upgradeFromOEM = function () {
    $scope.waitActivate = true;
    RSCom.send("upgradeLicence", {
      licence: $scope.upgradeLicense
    }).then(function (lic) {
      $scope.waitActivate = false;
      if (lic.success) {
        $scope.licence.active = true;
        $scope.deactivated = false;
        $scope.licenceError = false;
        // noinspection JSDeprecatedSymbols
        location.reload(true);
      } else $scope.licenceError = lic.errorMsg;
      updateData();
    });
  };
  $scope.deactivate = function () {
    if ($scope.licence.active) {
      $scope.waitDeactivate = true;
      RSCom.send("setLicenceData", {
        a: "deactivate"
      }).then(function (lic) {
        $scope.waitDeactivate = false;
        if (lic.success) {
          $scope.licence.active = false;
          $scope.deactivated = true;
          $scope.licenceError = false;
          // noinspection JSDeprecatedSymbols
          location.reload(true);
        } else $scope.licenceError = lic.errorMsg;
        updateData();
      });
    }
  };
  $scope.autoupdate = function () {
    $scope.isUpdating = false;
    RSCom.send("autoupdate", {}).then(function (d) {
      $scope.isUpdating = true;
      $scope.updateError = d.error;
      if (d.error === "") {
        Flash.success("<?php _('Autoupdate started') ?>");
        if ($rootScope.serverSettings.ServerOS === 0 || $rootScope.serverSettings.ServerOS === 2) $scope.registerResult = "<?php _('Downloading and starting update. Display will reload when finished.') ?>";else $scope.registerResult = "<?php _('Downloading and starting update.') ?>";
      }
    });
  };
  updateData();
}]);
/**
 * Created by littwin on 20.03.14.
 */
RSBase.controller('RegisterBrandingController', ['$scope', '$rootScope', 'RSCom', 'Flash', function ($scope, $rootScope, RSCom, Flash) {
  $scope.update = {};
  $scope.licence = {
    licence: '',
    active: false
  };
  $scope.licenceValid = false;
  $scope.deactivated = false;
  $scope.licenceError = false;
  $scope.waitActivate = false;
  $scope.waitDeactivate = false;
  $scope.updateError = "";
  $scope.registerResult = "";
  $scope.isUpdating = false;
  var updateData = function updateData() {
    RSCom.updateImportant();
    RSCom.send("getLicenceData", {}).then(function (lic) {
      $scope.licence = lic;
    });
  };
  $scope.$on("connected", function () {
    if ($scope.isUpdating) {
      // noinspection JSDeprecatedSymbols
      location.reload(true);
    } else updateData();
  });
  $scope.$on("autoupdateResponse", function (event, e) {
    if (e.data.code === 0) $scope.registerResult = e.data.response;else $scope.updateError = e.data.response;
    $scope.isUpdating = false;
  });
  function isLicenceValid(group) {
    return group.length === 29;
  }
  function formatGroup(group) {
    group = (0, _basicDirectives.replaceAll)("-", "", group.toUpperCase()).trim();
    var ng = "";
    for (var i = 0; i < group.length; i++) {
      var c = group.charAt(i);
      if (c >= '0' && c <= '9' || c >= 'A' && c <= 'Z') ng += c;
    }
    group = ng.substr(0, 25);
    ng = "";
    while (group.length > 0) {
      ng += group.substr(0, 5);
      if (group.length > 5) {
        ng += "-";
        group = group.substr(5);
      } else group = "";
    }
    return ng;
  }
  $scope.$watch('licence.licence', function (newVal) {
    if (typeof newVal === 'undefined') return;
    var cor = formatGroup(newVal);
    if (cor !== newVal) $scope.licence.licence = cor;
    $scope.licenceValid = isLicenceValid(cor);
  });
  $scope.activate = function () {
    $scope.waitActivate = true;
    RSCom.send("setLicenceData", {
      a: "activate",
      licence: $scope.licence.licence
    }).then(function (lic) {
      $scope.waitActivate = false;
      if (lic.success) {
        $scope.licence.active = true;
        $scope.deactivated = false;
        $scope.licenceError = false;
        window.location.href = "/?lang=" + window.lang;
      } else $scope.licenceError = lic.errorMsg;
      updateData();
    });
  };
  $scope.autoupdate = function () {
    $scope.isUpdating = false;
    RSCom.send("autoupdate", {}).then(function (d) {
      $scope.isUpdating = true;
      $scope.updateError = d.error;
      if (d.error === "") {
        Flash.success("<?php _('Autoupdate started') ?>");
        if ($rootScope.serverSettings.ServerOS === 0 || $rootScope.serverSettings.ServerOS === 2) $scope.registerResult = "<?php _('Downloading and starting update. Display will reload when finished.') ?>";else $scope.registerResult = "<?php _('Downloading and starting update.') ?>";
      }
    });
  };
  updateData();
}]);
},{"./basicDirectives":104}],103:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

RSBase.controller('ServerController', ['$scope', '$rootScope', '$timeout', '$http', 'RSCom', '$q', 'User', 'RSOverview', 'RSMessages', 'RSRegistry', 'GSettings', 'RSFrontend', '$uibModal', 'Flash', 'Fullscreen', '$state', 'Confirm', 'RSPrinter', 'AdvertisementController', function ($scope, $rootScope, $timeout, $http, RSCom, $q, User, RSOverview, RSMessages, RSRegistry, GSettings, RSFrontend, $uibModal, Flash, Fullscreen, $state, Confirm, RSPrinter, AdvertisementController) {
  $rootScope.user = User;
  $scope.overview = RSOverview;
  $scope.RSRegistry = RSRegistry;
  $rootScope.page = "";
  $rootScope.ft = 51;
  $scope.question = {};
  $scope.menuMessages = false;
  $scope.menuMain = false;
  $scope.menuHardware = false;
  $scope.menuLanguage = false;
  $scope.menuPrinter = false;
  var randomRefreshNumber = Math.floor(Math.random() * 10) + 1;
  $rootScope.view = {
    showLeft: true,
    showRight: true,
    showFullscreen: false
  };
  var overrideView = {
    hideLeft: false,
    hideRight: false,
    fullscreen: false
  };
  $rootScope.setOverride = function (name, value) {
    overrideView[name] = value;
    updateViews();
  };
  var adVisible = false;
  var showAd = function showAd() {
    RSOverview.printerListLoadedPromise.then(function () {
      var debugAds = false;
      if (!$rootScope.isPro() && !$rootScope.isOEM() || debugAds) {
        var showUpDate = localStorage.getItem('RServer.reminderLastTimeVisible') || new Date();
        if (!adVisible && (debugAds || randomRefreshNumber === 10 || new Date().getTime() >= parseInt(showUpDate))) {
          //console.log('show reminder')
          randomRefreshNumber = 0;
          var nextShowUp = new Date();
          nextShowUp.setDate(nextShowUp.getDate() + 7);
          adVisible = true;
          AdvertisementController().then(function () {
            localStorage.setItem('RServer.reminderLastTimeVisible', nextShowUp.getTime().toString());
            adVisible = false;
          });
        }
      }
    });
  };
  // showAd()
  // this.intervalAdvertisement = setInterval(showAd, 60000)

  var updateViews = function updateViews() {
    var userSettings = false;
    if (User.isLoggedIn) {
      userSettings = User.getSetting('leftPrinterList', '0') === "1";
    }
    $rootScope.view.showLeft = userSettings && User.getSetting('leftPrinterList', '0') === "1" && $rootScope.wwidth > 1520 && !overrideView.hideLeft;
    $rootScope.view.showFullscreen = overrideView.fullscreen;
  };
  updateViews();
  $rootScope.$on('userSettingsChanged', updateViews);
  $scope.closeMessages = function () {
    $scope.menuMessages = false;
  };
  $scope.closeMain = function () {
    $scope.menuMain = false;
  };
  $scope.closeHardware = function () {
    $scope.menuHardware = false;
  };
  $scope.closeLanguage = function () {
    $scope.menuLanguage = false;
  };
  $scope.showPrinter = function (p) {
    var link = RSPrinter.getActivePage(p, {
      state: 'printer.print',
      params: {
        slug: p
      }
    });
    $state.go(link.state, link.params);
    $scope.menuPrinter = false;
  };
  $scope.supportedLanguages = {};
  $http.get("/languages.json").then(function (data) {
    $scope.supportedLanguages = data.data;
  }, function () {});
  var resizer = function resizer() {
    $rootScope.wwidth = $(window).width();
    $rootScope.wheight = $(window).height();
    updateViews();
    $rootScope.$broadcast("windowResized", {
      width: $rootScope.wwidth,
      height: $rootScope.wheight
    });
  };
  $(window).resize(resizer);
  resizer();
  $scope.executeGlobalExternalLink = function (x) {
    $scope.menuMain = false;
    if (x.openExternal) {
      window.open(x.href, '_blank');
    } else {
      $state.go('externalLink', {
        id: x.id
      });
    }
  };
  $scope.$on('$destroy', function () {
    // clearInterval(this.intervalAdvertisement)
    $rootScope.setOverride("hideLeft", false);
    $(window).off("resize", resizer);
  });
  $scope.toggleFullscreen = function () {
    Fullscreen.toggleFullscreen(window.document.body);
  };
  $scope.selectLanguage = function (lang) {
    var l = document.URL;
    var lp = l.indexOf("lang=");
    if (lp < 0) {
      lp = l.indexOf("#");
      var lp2 = l.indexOf("?");
      if (lp2 < 0) {
        if (lp < 0) lp = l.length;
        l = l.substr(0, lp) + "?lang=" + lang + l.substr(lp);
      } else {
        l = l.substr(0, lp) + "&lang=" + lang + l.substr(lp);
      }
    } else {
      l = l.substr(0, lp + 5) + lang + l.substr(lp + 7);
    }
    console.log('select ', lang, l);
    window.location = l;
  };
  var modeShown = -1;
  $scope.$on("newUpdateLoaded", function (evt, r) {
    if (r.testperiodMode === 2 && modeShown > -1 && modeShown !== 2) {
      // noinspection JSDeprecatedSymbols
      location.reload(true);
    }
    if (r.testperiodMode > 2 && modeShown === 2) {
      modeShown = r.testperiodMode;
      // noinspection JSDeprecatedSymbols
      location.reload(true);
    }
    if (r.testperiodMode === 2) modeShown = 2;
    if (r.testperiodMode === 0 && modeShown !== 0) {
      modeShown = 0;
      $uibModal.open({
        templateUrl: '/views/services/startTestperiod.modal.php?lang=' + lang,
        scope: $scope,
        size: 'lg',
        controller: ['$scope', '$uibModalInstance', function ($scope2, $uibModalInstance) {
          $scope2.noTest = function () {
            RSCom.send("setTestperiodMode", {
              mode: 1
            }).then(function () {
              $uibModalInstance.close();
            }, function () {});
          };
          $scope2.startPeriod = function () {
            Flash.info("<?php _('Starting Trial Period') ?>");
            RSCom.send("setTestperiodMode", {
              mode: 2
            }).then(function () {
              $uibModalInstance.close();
            });
          };
        }]
      }).result.catch(function (res) {});
    }
    if (r.testperiodMode === 3 && modeShown !== 3) {
      modeShown = 3;
      $uibModal.open({
        templateUrl: '/views/services/endTestperiod.modal.php?lang=' + lang,
        scope: $scope,
        size: 'lg',
        controller: ['$scope', '$uibModalInstance', function ($scope2, $uibModalInstance) {
          $scope2.ok = function () {
            RSCom.send("setTestperiodMode", {
              mode: 4
            }).then(function () {
              $uibModalInstance.close();
            });
          };
        }]
      }).result.catch(function (res) {});
    }
  });
  var cachedQr = {};
  $scope.qr = function (ip, port, margin, modsize) {
    if (!margin) margin = 0;
    if (!modsize) modsize = 4;
    var link = $rootScope.httpType + "://" + ip + ":" + port;
    var res = cachedQr[link];
    if (!res) {
      res = QRCode.generatePNG(link, {
        modulesize: modsize,
        margin: margin
      });
      cachedQr[link] = res;
    }
    return res;
  };
  $scope.qr6 = function (ip, port, margin, modsize) {
    if (!margin) margin = 0;
    if (!modsize) modsize = 4;
    var link = $rootScope.httpType + "://[" + ip + "]:" + port;
    var res = cachedQr[link];
    if (!res) {
      res = QRCode.generatePNG(link, {
        modulesize: modsize,
        margin: margin
      });
      cachedQr[link] = res;
    }
    return res;
  };
  $scope.runCall = function (w) {
    if (w.question) {
      Confirm("<?php _('Security question') ?>", w.question).then(function () {
        RSCom.send("webCallExecute", {
          name: w.name,
          params: ['Test']
        });
      });
    } else {
      RSCom.send("webCallExecute", {
        name: w.name,
        params: ['Test']
      });
    }
  };
  $scope.runGPIOCall = function (w) {
    if (w.operation === 3) {
      if (w.securityQuestion) {
        var msg = (w.state ? "<?php _('Really disable @?') ?>" : "<?php _('Really enable @?') ?>").replace('@', w.display);
        Confirm("<?php _('Security Question') ?>", msg, "<?php _('Yes') ?>", "<?php _('No') ?>", true).then(function () {
          RSCom.send("GPIORun", {
            uuid: w.uuid,
            cmd: 'toggle'
          });
        }, function () {});
      } else {
        RSCom.send("GPIORun", {
          uuid: w.uuid,
          cmd: 'toggle'
        });
      }
    }
    if (w.operation === 4) {
      $uibModal.open({
        templateUrl: '/views/gsettings/gpioPWMDialog.php?lang=' + lang,
        size: 'sm',
        controller: ['$scope', function ($scope2) {
          $scope2.pin = w;
          console.log('pin diag', w, $scope2);
          $scope2.disablePin = function () {
            RSCom.send("GPIORun", {
              uuid: $scope2.pin.uuid,
              cmd: 'off'
            }).then(function () {
              $scope2.$close();
            }, function () {});
          };
          $scope2.setPWM = function (val) {
            $scope2.pin.state = true;
            // $scope2.pin.pwmDutyCycle = val
            console.log('pwm', val, $scope2.pin);
            RSCom.send("GPIORun", {
              uuid: $scope2.pin.uuid,
              cmd: '' + val
            });
          };
        }]
      });
    }
  };
  $scope.$on('changeFilamentRequested', function (name, evt) {
    console.log("Change filament requested", evt);
    $state.go('printer.filamentchange', {
      slug: evt.printer,
      extruder: evt.data.extruder
    });
  });
}]);
RSBase.controller('ManufacturerNewsController', ['$scope', '$rootScope', '$http', 'RSCom', '$q', 'User', 'RSOverview', 'Flash', function ($scope, $rootScope, $http, RSCom, $q, User, RSOverview, Flash) {
  var markRead = function markRead(block) {
    RSCom.send("markManufacturerNewsRead", {
      uuid: block.uuid
    }).then(function () {
      block.read = true;
    });
  };
  $scope.panelClass = {};
  var updateClasses = function updateClasses() {
    $rootScope.manufacturerNews.forEach(function (block) {
      if (!$scope.panelClass[block.uuid]) {
        $scope.panelClass[block.uuid] = block.read ? 'panel-default' : 'panel-info';
        if (!block.read) {
          markRead(block);
        }
      }
    });
  };
  $scope.$on('manufacturerNewsUpdated', updateClasses);
  updateClasses();
}]);
},{}],104:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.log = log;
exports.replaceAll = replaceAll;
var _manualReader = require("./manualReader");
function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _iterableToArrayLimit(arr, i) { var _i = null == arr ? null : "undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"]; if (null != _i) { var _s, _e, _x, _r, _arr = [], _n = !0, _d = !1; try { if (_x = (_i = _i.call(arr)).next, 0 === i) { if (Object(_i) !== _i) return; _n = !1; } else for (; !(_n = (_s = _x.call(_i)).done) && (_arr.push(_s.value), _arr.length !== i); _n = !0); } catch (err) { _d = !0, _e = err; } finally { try { if (!_n && null != _i.return && (_r = _i.return(), Object(_r) !== _r)) return; } finally { if (_d) throw _e; } } return _arr; } }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
// noinspection JSUnusedLocalSymbols
var dummy = {
  modelValue: undefined,
  error: undefined,
  dialogType: undefined,
  dropdownAppendTo: undefined,
  dropdownAppendToBody: undefined,
  rsEnter: undefined,
  dropdownNested: undefined,
  fileUpload: undefined,
  keyboardNav: undefined
};
function escapeRegExp(str) {
  // return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&")
  return str.replace(/[\-\[\]\/{}()*+?.^$|]/g, "\\$&");
}
function replaceAll(find, replace, str) {
  return str.replace(new RegExp(escapeRegExp(find), 'g'), replace);
}
function log() {
  if (window.console) {
    angular.forEach(arguments, function (p) {
      console.log(p);
    });
  }
}

// var isFullscreen = false
var INTEGER_REGEXP = /^-?\d+$/;
// const COLOR_REGEXP = /^#([A-Fa-f0-9]{6})$/

RSBase.factory('Fullscreen', ['$rootScope', function ($rootScope) {
  var fs = {};
  $rootScope.isFullscreen = false;
  fs.supportsFullscreen = function () {
    var ele = window.document.body;
    return !!(ele.requestFullscreen || ele.mozRequestFullScreen || ele.webkitRequestFullscreen || ele.msRequestFullscreen);
  };
  $rootScope.supportsFullscreen = fs.supportsFullscreen();
  fs.launchFullscreen = function (element) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
      $rootScope.isFullscreen = true;
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
      $rootScope.isFullscreen = true;
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
      $rootScope.isFullscreen = true;
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
      $rootScope.isFullscreen = true;
    }
  };

  //noinspection JSUnusedLocalSymbols
  fs.exitFullscreen = function () {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    }
    $rootScope.isFullscreen = false;
  };
  fs.toggleFullscreen = function (element) {
    if ($rootScope.isFullscreen) {
      fs.exitFullscreen();
    } else {
      fs.launchFullscreen(element);
    }
  };
  var changeHandler = function changeHandler() {
    $rootScope.isFullscreen = !!(document.webkitIsFullScreen || document.mozFullScreen || document.msFullscreenElement);
    $rootScope.$broadcast('fullscreenChanged');
    $rootScope.$digest();
  };
  document.addEventListener("fullscreenchange", changeHandler, false);
  document.addEventListener("webkitfullscreenchange", changeHandler, false);
  document.addEventListener("mozfullscreenchange", changeHandler, false);
  return fs;
}]);
RSBase.directive('onFileChange', function () {
  return {
    restrict: 'A',
    link: function link(scope, element, attrs) {
      var onChangeHandler = scope.$eval(attrs.onFileChange);
      element.on('change', onChangeHandler);
      element.on('$destroy', function () {
        element.off();
      });
    }
  };
});
/* let fidCounter = 0

function newFid () {
  fidCounter++
  return "fid" + fidCounter
} */

RSBase.directive('switch', ['$timeout', function ($timeout) {
  return {
    restrict: 'E',
    scope: {
      changed: '&'
    },
    template: '<input type="checkbox" data-size="small">',
    replace: true,
    require: 'ngModel',
    link: function link(scope, elem, attr, ngModel) {
      ngModel.$parsers = [];
      ngModel.$formatters = [];
      var on = attr.on || "<?php _('On') ?>";
      var off = attr.off || "<?php _('Off') ?>";
      ngModel.$formatters.push(function (newValue) {
        if (typeof newValue !== "undefined") {
          $timeout(function () {
            elem.bootstrapSwitch('state', !!newValue);
          });
        }
        return newValue;
      });
      scope.$on('$destroy', function () {
        elem.bootstrapSwitch('destroy');
      });
      elem.on('switchChange.bootstrapSwitch', function (e, data) {
        data = data ? 1 : 0;
        scope.$apply(function () {
          ngModel.$setViewValue(data);
        });
        if (scope.changed) {
          scope.changed({
            value: data
          });
        }
      });
      $timeout(function () {
        elem.bootstrapSwitch('state', !!ngModel.$modelValue);
      });
      elem.bootstrapSwitch({
        onText: on,
        offText: off
      });
      ngModel.$validators.color = function () {
        return true;
      };
    }
  };
}]).directive("ngTouchstart", function () {
  return {
    controller: ['$scope', '$element', function ($scope, $element /* , $attrs */) {
      $element.bind('touchstart', onTouchStart);
      function onTouchStart(event) {
        var method = $element.attr('ng-touchstart');
        $scope.$event = event;
        $scope.$apply(method);
      }
    }]
  };
}).directive('boolswitch', ['$timeout', function ($timeout) {
  return {
    restrict: 'E',
    scope: {
      changed: '&'
    },
    template: '<input type="checkbox" data-size="small">',
    replace: true,
    require: 'ngModel',
    link: function link(scope, elem, attr, ngModel) {
      var on = attr.on || "<?php _('On') ?>";
      var off = attr.off || "<?php _('Off') ?>";
      ngModel.$formatters.push(function (newValue) {
        // listens on ngModel changes
        if (typeof newValue !== "undefined") {
          $timeout(function () {
            if (newValue === "false") newValue = false;
            if (newValue === "true") newValue = true;
            elem.bootstrapSwitch('state', newValue || false, true);
          });
        }
      });
      elem.on('switchChange.bootstrapSwitch', function (e, data) {
        scope.$apply(function () {
          ngModel.$setViewValue(data);
        });
        if (scope.changed) {
          scope.changed({
            value: data
          });
        }
      });
      $timeout(function () {
        elem.bootstrapSwitch('state', ngModel.$modelValue || false);
      });
      elem.bootstrapSwitch({
        onText: on,
        offText: off
      });
      scope.$on('$destroy', function () {
        elem.bootstrapSwitch('destroy');
      });
    }
  };
}]).directive('tempChart', [function () {
  return {
    restrict: 'E',
    template: '<div class="flot-chart"><div class="flot-chart-content"></div></div>',
    replace: true,
    scope: {
      history: '='
    },
    link: function link(scope, elem, attr) {
      var outputSeries = [];
      var tempSeries = [];
      var tempSetSeries = [];
      var flotElement = elem.children(0);
      var series = [{
        data: outputSeries,
        label: "<?php _('Output') ?>",
        yaxis: 2,
        color: "#3E714A",
        lines: {
          fill: true,
          fillColor: "rgba(108,240,139,0.2)",
          lineWidth: 1
        }
      }, {
        data: tempSeries,
        label: "<?php _('Temperature') ?>",
        color: "#2D7495",
        lines: {
          lineWidth: 5
        }
      }, {
        data: tempSetSeries,
        label: "<?php _('Target Temperature') ?>",
        color: "#A541B4",
        lines: {
          lineWidth: 1
        }
      }];
      var plotOptions = {
        xaxes: [{
          mode: 'time',
          timeFormat: '%M:%S',
          timezone: "browser"
          // color: $(document.body).css('color')
        }],

        yaxes: [{
          min: 0,
          max: 250,
          alignTicksWithAxis: 1,
          position: "left",
          tickFormatter: tempFormatter,
          family: "sans-serif",
          size: 8
          // color: $(document.body).css('color')
        }, {
          // align if we are to the right
          alignTicksWithAxis: null,
          position: "right",
          min: 0,
          max: 100,
          tickFormatter: percentFormatter
          //color: $(document.body).css('color')
        }],

        legend: {
          position: 'sw'
        },
        grid: {
          backgroundColor: document.documentElement.getAttribute("data-theme") === 'dark' ? '#222222' : '#ffffff',
          hoverable: true //IMPORTANT! this is needed for tooltip to work?
        },

        tooltip: true,
        tooltipOpts: {
          content: "%s for %x was %y",
          xDateFormat: "%H:%M:%S",
          onHover: function onHover(flotItem, $tooltipEl) {}
        }
      };
      plotOptions.legend.show = false;
      if (typeof attr.compact !== "undefined") {
        plotOptions.legend.show = false;
        plotOptions.tooltip = false;
      }
      function setTheme(theme) {
        plotOptions.grid.backgroundColor = theme === 'dark' ? "#222222" : '#ffffff';
        plot = $.plot(flotElement, series, plotOptions);
        plot.draw();
      }
      function tempFormatter(v) {
        return v.toFixed(0) + "°C";
      }
      function percentFormatter(v) {
        return v.toFixed(0) + "%";
      }

      /* function emptyFormatter () {
        return ""
      } */
      scope.$on('themeChanged', function (theme, data) {
        setTheme(data);
      });
      var plot = null;
      var destroyed = false;
      plot = $.plot(flotElement, series, plotOptions);
      scope.$watchCollection('history', function (newValue) {
        if (typeof newValue !== "undefined") {
          outputSeries.length = 0;
          tempSeries.length = 0;
          tempSetSeries.length = 0;
          var smallest = 1000;
          var biggest = -1000;
          angular.forEach(newValue, function (e) {
            var t = e.t;
            if (e.T > biggest) biggest = e.T;
            if (e.S > biggest) biggest = e.S;
            if (e.T < smallest) smallest = e.T;
            if (e.S < smallest) smallest = e.S;
            outputSeries.push([t, e.O]);
            tempSeries.push([t, e.T]);
            tempSetSeries.push([t, e.S]);
          });
          smallest -= 5;
          biggest += 5;
          if (smallest < 0) smallest = 0;
          plot.getOptions().yaxes[0].min = smallest;
          plot.getOptions().yaxes[0].max = biggest;
          plot.setData(series);
          plot.setupGrid();
          plot.draw();
        }
      });
      scope.$on('windowResized', function () {
        if (flotElement.width() > 0) {
          plot = $.plot(flotElement, series, plotOptions);
        }
      });
      var oldWidth = -1;
      var watchWidth = function watchWidth() {
        if (flotElement.width() !== oldWidth && flotElement.width() > 0) {
          oldWidth = flotElement.width();
          plot = $.plot(flotElement, series, plotOptions);
        }
        if (!destroyed) setTimeout(watchWidth, 200);
      };
      scope.$on('$destroy', function () {
        // elem.bootstrapSwitch('destroy');
        destroyed = true;
      });
      watchWidth();
    }
  };
}]).directive('knob', function () {
  return {
    restrict: 'E',
    scope: {
      value: '=',
      changed: '&'
    },
    replace: true,
    template: '<div><input type="text" class="dial "></div>',
    link: function link(scope, elem, attr) {
      var maxSet = attr.max;
      $('.dial', elem).knob({
        min: parseFloat(attr.min),
        max: parseFloat(attr.max),
        angleOffset: -125,
        angleArc: 250,
        width: 100,
        height: 100,
        inputColor: '#005B6E',
        fgColor: '#005B6E',
        lineCap: "butt",
        'release': function release(v) {
          if (isFinite(v)) {
            if (Math.abs(scope.value - v) < 0.01) {
              // Value was changed externally, don't trigger again
              return;
            }
            scope.value = v;
            if (maxSet !== attr.max) {
              maxSet = Math.max(v, attr.max);
              $('.dial', elem).trigger('configure', {
                "max": maxSet
              });
            }
            if (scope.changed) {
              scope.changed({
                value: v
              });
            }
          }
        },
        'change': function change(v) {// gets called for every value change. We wait until we are finished
          // console.log("Change "+v);
        }
      });
      elem.addClass("knob");
      elem[0].style.position = "relative";
      scope.$watch('value', function (newValue) {
        if (typeof newValue === 'undefined') return;
        if ($('.dial', elem).val() === newValue) return;
        if (isFinite(Number(newValue))) {
          if (newValue > attr.max) {
            maxSet = newValue;
            $('.dial', elem).trigger('configure', {
              "max": newValue
            });
          }
          $('.dial', elem).val(newValue).trigger('change');
        }
      });
      attr.$observe('min', function (newValue) {
        $('.dial', elem).trigger('setMin', parseFloat(newValue));
      });
      attr.$observe('max', function (newValue) {
        $('.dial', elem).trigger('setMax', parseFloat(newValue));
      });
    }
  };
})

/*  .directive('colorpicker', function () {
 return {
 restrict: 'A',
 replace: false,
 require: 'ngModel',
 link: function (scope, elem, attr, ngModel) {
 var inside = false;
 var picker = elem.colorpicker();
 picker.on('changeColor', function (ev) {
 if (inside)
 return;
 inside = true;
 ngModel.$setViewValue(ev.color.toHex());
 inside = false;
 });
 ngModel.$validators.color = function (modelValue, viewValue) {
 return (COLOR_REGEXP.test(viewValue)) ? true : false;
 };
 scope.$watch(attr.ngModel, function (newValue) {
 $(elem).val(ngModel.$modelValue);
 $(elem).css('border-color', ngModel.$modelValue);
 $(elem).colorpicker('setValue', newValue);
 });
 }
 };
 })*/.directive('colorpicker', function () {
  return {
    restrict: 'EA',
    replace: true,
    require: 'ngModel',
    scope: {
      fallbackValue: '=',
      disabled: '=?',
      // triggerId: '@?',
      onChange: '&?'
    },
    link: function link($scope, elem, attr, $ngModel) {
      var qelem = $(elem);
      qelem.addClass('input-small');
      $scope.$on('$destroy', function () {
        /*if ($scope.triggerId) {
          angular.element(document.body).off('click', '#' + $scope.triggerId, onToggle)
        }*/
        qelem.spectrum('destroy');
      });

      /* const onChange = function (color) {
        $scope.$apply(function () {
          setViewValue(color)
        })
      } */

      function callOnChange(color) {
        if (angular.isFunction($scope.onChange)) {
          $scope.onChange({
            color: color
          });
        }
      }

      /* function setViewValue (color) {
        let value = $scope.fallbackValue
        console.log('setViewColor', color, value)
        if (color) {
          value = formatColor(color)
        } else if (angular.isUndefined($scope.fallbackValue)) {
          value = color
        }
        console.log('setViewColor2', color, value)
         $ngModel.$setViewValue(value)
        callOnChange(value)
      } */

      $ngModel.$render = function () {
        qelem.spectrum('set', $ngModel.$viewValue || '');
        callOnChange($ngModel.$viewValue);
      };
      var baseOpts = {
        color: $ngModel.$viewValue
      };
      var colorOptions = {
        showInput: true,
        className: "full-spectrum",
        showInitial: true,
        showPalette: true,
        showSelectionPalette: true,
        maxSelectionSize: 10,
        preferredFormat: "hex",
        chooseText: "<?php _('Choose') ?>",
        cancelText: "<?php _('Cancel') ?>",
        palette: [["rgb(0, 0, 0)", "rgb(67, 67, 67)", "rgb(102, 102, 102)", "rgb(204, 204, 204)", "rgb(217, 217, 217)", "rgb(255, 255, 255)"], ["rgb(152, 0, 0)", "rgb(255, 0, 0)", "rgb(255, 153, 0)", "rgb(255, 255, 0)", "rgb(0, 255, 0)", "rgb(0, 255, 255)", "rgb(74, 134, 232)", "rgb(0, 0, 255)", "rgb(153, 0, 255)", "rgb(255, 0, 255)"], ["rgb(230, 184, 175)", "rgb(244, 204, 204)", "rgb(252, 229, 205)", "rgb(255, 242, 204)", "rgb(217, 234, 211)", "rgb(208, 224, 227)", "rgb(201, 218, 248)", "rgb(207, 226, 243)", "rgb(217, 210, 233)", "rgb(234, 209, 220)", "rgb(221, 126, 107)", "rgb(234, 153, 153)", "rgb(249, 203, 156)", "rgb(255, 229, 153)", "rgb(182, 215, 168)", "rgb(162, 196, 201)", "rgb(164, 194, 244)", "rgb(159, 197, 232)", "rgb(180, 167, 214)", "rgb(213, 166, 189)", "rgb(204, 65, 37)", "rgb(224, 102, 102)", "rgb(246, 178, 107)", "rgb(255, 217, 102)", "rgb(147, 196, 125)", "rgb(118, 165, 175)", "rgb(109, 158, 235)", "rgb(111, 168, 220)", "rgb(142, 124, 195)", "rgb(194, 123, 160)", "rgb(166, 28, 0)", "rgb(204, 0, 0)", "rgb(230, 145, 56)", "rgb(241, 194, 50)", "rgb(106, 168, 79)", "rgb(69, 129, 142)", "rgb(60, 120, 216)", "rgb(61, 133, 198)", "rgb(103, 78, 167)", "rgb(166, 77, 121)", "rgb(91, 15, 0)", "rgb(102, 0, 0)", "rgb(120, 63, 4)", "rgb(127, 96, 0)", "rgb(39, 78, 19)", "rgb(12, 52, 61)", "rgb(28, 69, 135)", "rgb(7, 55, 99)", "rgb(32, 18, 77)", "rgb(76, 17, 48)"]]
      };
      var options = angular.extend({}, baseOpts, colorOptions);
      qelem.spectrum(options);
      $scope.$watch('disabled', function (newDisabled) {
        if (typeof newDisabled == "undefined") return;
        qelem.spectrum(newDisabled ? 'disable' : 'enable');
      });
    }
  };
}).directive('inputerror', function () {
  return {
    restrict: 'E',
    scope: {
      error: '=error'
    },
    template: '<div class="error" ng-show="error">{{error}}</div>',
    replace: true,
    link: function link(scope, elem, attr) {}
  };
}).directive('fileUpload', function () {
  return {
    restrict: 'E',
    scope: {
      done: '&',
      url: '@',
      title: '@',
      response: '&',
      formData: '@'
    },
    replace: true,
    //transclude:true,
    template: '<div><form enctype="multipart/form-data" method="post"><span class="btn  fileinput-button"><i class="icon-upload"></i> {{infoText}}<input type="file" name="file" ng-disabled="disabled">' + '</span><div ng-show="uploading"><p class="size">File size:{{fileSize | formatFileSize}}</p>' + '<div class="progress progress-success progress-striped active"><div class="bar" style="width:{{percent}}%}"><span style="position:absolute;text-align:center;left:0;right:0;color:#000000">{{percent}}%</span></div></div></div></form>' + '<div ng-show="fail" class="alert alert-error"><h4>Upload failed</h4>{{fail}}</div>' + '</div>',
    link: function link(scope, element, attr) {
      if (scope.title) scope.infoText = scope.title;else scope.infoText = "Upload";
      var optionsObj = {
        dataType: 'json',
        add: function add(e, data) {
          scope.$apply(function () {
            scope.uploading = true;
            scope.percent = 0;
            scope.fail = false;
          });
          data.submit();
        },
        fail: function fail(e, data) {
          scope.$apply(function () {
            scope.uploading = false;
            scope.percent = 0;
            scope.fail = "Upload failed";
            var reason = angular.fromJson(data.response().jqXHR.responseText);
            if (reason.error.message) scope.fail = reason.error.message;
          });
        },
        url: scope.url,
        formData: scope.formData
      };
      scope.percent = 0;
      scope.uploading = false;
      scope.file = $('input[type=file]', $(element));
      optionsObj.done = function (e, data) {
        scope.$apply(function () {
          scope.uploading = false;
          if (scope.response) scope.response({
            data: angular.fromJson(data.response().jqXHR.responseText)
          });
          if (scope.done) scope.done({
            e: e,
            data: data
          });
        });
      };
      optionsObj.progress = function (e, data) {
        scope.$apply(function () {
          scope.fileSize = data.total;
          scope.percent = parseInt(data.loaded / data.total * 100, 10);
        });
      };
      scope.file.fileupload(optionsObj);
      attr.$observe('url', function (value) {
        scope.file.fileupload('option', 'url', value);
      });
      attr.$observe('title', function (value) {
        scope.infoText = value;
      });
    }
  };
}).directive('autoset', function () {
  return {
    restrict: 'E',
    scope: {
      name: '@'
    },
    template: '<i class="fa margin-left" ng-class="result" ng-show="tested" title="{{comp}}"></i>',
    replace: true,
    require: 'ngModel',
    controller: ['$scope', function ($scope) {
      $scope.$on('firmwareConfigRead', function (event, data) {
        if (data && data.hasOwnProperty($scope.name)) {
          $scope.tested = true;
          $scope.comp = data[$scope.name] * $scope.nfactor;
          // use weak compare for boolean vs integer from xml file
          // eslint-disable-next-line
          $scope.result = $scope.comp == $scope.value ? "fa-dot-circle-o fg-success" : "fa-circle-o fg-danger";
        } else $scope.tested = false;
      });
    }],
    link: function link(scope, elem, attr, controller) {
      scope.nfactor = attr.nfactor ? parseFloat(attr.nfactor) : 1;
      scope.tested = false;
      controller.$formatters.push(function (newValue) {
        scope.value = newValue;
        if (newValue !== undefined) {
          scope.result = scope.comp === newValue ? "fa-dot-circle-o fg-success" : "fa-circle-o fg-danger";
        }
      });
    }
  };
}).directive('dragme', function () {
  return {
    restrict: 'A',
    link: function link(scope, element) {
      $(element).dragScroll({});
    }
  };
}).directive('integer', function () {
  return {
    require: 'ngModel',
    link: function link(scope, elm, attrs, ctrl) {
      ctrl.$parsers.unshift(function (viewValue) {
        if (INTEGER_REGEXP.test(viewValue)) {
          // it is valid
          ctrl.$setValidity('integer', true);
          return viewValue;
        } else {
          // it is invalid, return undefined (no model update)
          ctrl.$setValidity('integer', false);
          return undefined;
        }
      });
      /* angularjs 1.3 version
       ctrl.$validators.integer = function (modelValue, viewValue) {
       if (ctrl.$isEmpty(modelValue)) {
       return true; // consider empty models to be valid
       }
       return (INTEGER_REGEXP.test(viewValue)) ? true : false;
       */
    }
  };
}).directive('aDisabled', function () {
  return {
    compile: function compile() {
      // attrs["ngClick"] = "!(" + attrs["aDisabled"] + ") && (" + attrs["ngClick"] + ")";
      return function (scope, iElement, iAttrs) {
        scope.$watch(iAttrs["aDisabled"], function (newValue) {
          if (typeof newValue !== "undefined") {
            iElement.toggleClass("disabled", newValue);
          }
        });
        iElement.on("click", function (e) {
          if (scope.$eval(iAttrs["aDisabled"])) {
            e.preventDefault();
          }
        });
      };
    }
  };
}).directive('rsEnter', function () {
  return function (scope, element, attrs) {
    element.bind("keydown keypress", function (event) {
      if (event.which === 13) {
        scope.$apply(function () {
          scope.$eval(attrs.rsEnter);
        });
        event.preventDefault();
      }
    });
  };
}).directive('rsInPlaceNumber', ['$timeout', function ($timeout) {
  return {
    restrict: 'E',
    scope: {
      value: '=',
      precision: '@',
      changed: '&',
      readonly: '<' + '?'
    },
    template: '<span ng-click="edit()" ng-bind="value | number:precision"></span><input ng-model="valueInt" class="nospin" rs-enter="close()" type="number">',
    link: function link($scope, element) {
      var input = angular.element(element.children()[1]);
      element.addClass('edit-in-place');
      element.addClass("edit-in-place-number");
      $scope.editing = false;
      $scope.edit = function () {
        if ($scope.hasOwnProperty('readonly') && $scope.readonly) {
          return;
        }
        $scope.valueInt = $scope.value;
        $scope.editing = true;
        element.addClass('active');
        input[0].focus();
        $scope.orig = $scope.value;
      };
      $scope.close = function () {
        input.blur();
      };
      input.on('blur', function () {
        if ($scope.editing && $scope.orig !== $scope.valueInt) {
          if ($scope.valueInt == null) {
            $scope.value = $scope.orig;
          } else {
            $scope.value = $scope.valueInt;
          }
          $timeout(function () {
            $scope.changed({
              newValue: $scope.value,
              oldValue: $scope.orig
            });
          });
        }
        $scope.editing = false;
        element.removeClass('active');
      });
    }
  };
}]).directive('rsInPlaceString', function () {
  return {
    restrict: 'E',
    scope: {
      value: '=',
      changed: '&',
      readonly: '<' + '?'
    },
    template: '<span ng-click="edit()" ng-bind="value"></span><input ng-model="value" rs-enter="close()" type="text">',
    link: function link($scope, element) {
      var input = angular.element(element.children()[1]);
      element.addClass('edit-in-place');
      element.addClass("edit-in-place-string");
      $scope.editing = false;
      $scope.edit = function () {
        if ($scope.hasOwnProperty('readonly') && $scope.readonly) {
          return;
        }
        $scope.editing = true;
        element.addClass('active');
        input[0].focus();
        $scope.orig = $scope.value;
      };
      $scope.close = function () {
        input.blur();
      };
      input.on('blur', function () {
        if ($scope.editing && $scope.orig !== $scope.value) {
          if ($scope.value == null) $scope.value = $scope.orig;
          $scope.changed({
            newValue: $scope.value,
            oldValue: $scope.orig
          });
        }
        $scope.editing = false;
        element.removeClass('active');
      });
    }
  };
}).directive('preventEnterSubmit', function () {
  return function (scope, el) {
    el.bind('keydown', function (event) {
      if (13 === event.which) {
        event.preventDefault();
        window.stop();
        document.execCommand('Stop');
      }
    });
  };
}).directive('convertToNumber', function () {
  return {
    require: 'ngModel',
    link: function link(scope, element, attrs, ngModel) {
      ngModel.$parsers.push(function (val) {
        return val != null ? parseInt(val, 10) : null;
      });
      ngModel.$formatters.push(function (val) {
        return val != null ? '' + val : null;
      });
    }
  };
}).component('rsDialog', {
  controller: ['$element', '$interval', '$rootScope', 'RSCom', '$document', '$sce', function ($element, $interval, $rootScope, RSCom, $document, $sce) {
    var _this = this;
    var startX = 0;
    var startY = 0;
    this.inputEntrys = {};
    this.inputErrors = {};
    var elem = angular.element($element[0].childNodes[0]);
    // const parent = angular.element('#page-wrapper') // $element.parent() //
    this.x = 0.5 * (window.innerWidth - elem.outerWidth());
    this.y = 150;
    this.extraClass = '';
    this.buttonClass = 'btn-primary';
    this.iconClass = 'fa-arrows';
    setTimeout(function () {
      _this.x = 0.5 * (window.innerWidth - elem.outerWidth());
      _this.y = 0.3 * (window.innerHeight - elem.outerHeight());
      _this.extraClass = _this.dialog.dialogType === 1 ? 'info' : _this.dialog.dialogType === 2 ? 'warning' : _this.dialog.dialogType === 3 ? 'error' : '';
      _this.buttonClass = _this.dialog.dialogType === 1 ? 'btn-info' : _this.dialog.dialogType === 2 ? 'btn-warning' : _this.dialog.dialogType === 3 ? 'btn-danger' : 'btn-primary';
      _this.iconClass = _this.dialog.dialogType === 1 ? 'fa fa-info-circle' : _this.dialog.dialogType === 2 ? 'fa fa-exclamation-triangle' : _this.dialog.dialogType === 3 ? 'fa fa-exclamation' : 'rs rs-printer';
      _this.dialog.input.forEach(function (i) {
        _this.inputEntrys[i.name] = _this.getDefaultVal(i);
        _this.updateError(i);
      });
      _this.message = $sce.trustAsHtml(_this.dialog.message);
      // console.log('start values', this.inputEntrys)
    }, 0);
    this.getTypeSteps = function (c) {
      if (c.dataType === "Int") {
        return "1";
      }
      return "any";
    };
    this.getDefaultVal = function (c) {
      if (c.dataType === "Double") {
        return parseFloat(c.defaultValue);
      }
      if (c.dataType === "Int") {
        return parseInt(c.defaultValue);
      }
      return c.defaultValue;
    };
    /* this.inputChanged = (name, val) => {
      if (val != undefined && name != undefined) {
        inputEntrys[name.toString()] = val.toString()
      }
    }*/

    var mousemove = function mousemove(event) {
      if (event.originalEvent.touches) {
        // touch to mouse
        event.screenX = event.originalEvent.touches.item(0).screenX;
        event.screenY = event.originalEvent.touches.item(0).screenY;
      }
      _this.y = event.screenY - startY;
      _this.x = event.screenX - startX;
      _this.x = Math.max(0, _this.x);
      _this.y = Math.max(0, _this.y);
      _this.x = Math.min(_this.x, window.innerWidth /* parent.outerWidth() */ - elem.outerWidth());
      _this.y = Math.min(_this.y, window.innerHeight /* parent.outerHeight() */ - elem.outerHeight());
      // noinspection JSSuspiciousNameCombination
      $element.css({
        top: _this.x,
        left: _this.y
      });
    };
    var mouseup = function mouseup() {
      $document.unbind('mousemove', mousemove);
      $document.unbind('mouseup', mouseup);
      $document.unbind('touchmove', mousemove);
      $document.unbind('touchend', mouseup);
    };
    this.shouldBeVisible = function () {
      return $rootScope.user.printPermission || _this.dialog.dialogType !== 0 && _this.dialog.dialogType !== 4;
    };
    this.startDrag = function (event) {
      // Prevent default dragging of selected content
      event.preventDefault();
      if (event.originalEvent.touches) {
        // touch to mouse
        event.screenX = event.originalEvent.touches.item(0).screenX;
        event.screenY = event.originalEvent.touches.item(0).screenY;
      }
      startX = event.screenX - _this.x;
      startY = event.screenY - _this.y;
      $document.on('mousemove', mousemove);
      $document.on('mouseup', mouseup);
      $document.on('touchmove', mousemove);
      $document.on('touchend', mouseup);
    };
    this.selectClose = function (idx) {
      var inp = {};
      var error = false;
      Object.keys(_this.inputErrors).forEach(function (k) {
        _this.inputErrors[k].visible = _this.inputErrors[k].error !== false;
        error = error || _this.inputErrors[k].error !== false;
      });
      Object.keys(_this.inputEntrys).forEach(function (k) {
        if (_this.inputEntrys[k] === undefined) {
          inp[k] = "";
        } else {
          inp[k] = _this.inputEntrys[k].toString();
        }
      });
      RSCom.send('closeDialog', {
        id: _this.dialog.id,
        selection: idx,
        inputData: inp
      }, _this.dialog.printer).then(function (data) {
        if (!data.ok) {
          console.log("error: not allowed to close the dialog");
        }
      });
    };
    this.updateError = function (dialogInput) {
      var errorString = false;
      var value = _this.inputEntrys[dialogInput.name];
      if (value !== undefined && dialogInput.inputType === 0) {
        var minFloatCorrection = Math.round(parseFloat(dialogInput.minValue) * 1000) / 1000;
        var maxFloatCorrection = Math.round(parseFloat(dialogInput.maxValue) * 1000) / 1000;
        if (dialogInput.dataType === "String") {
          if (dialogInput.dataType === "String" && minFloatCorrection > value.length) {
            errorString = "<?php _('Minimum text length is: $1') ?>".replace("$1", minFloatCorrection.toString());
          } else if (dialogInput.dataType === "String" && maxFloatCorrection < value.length) {
            errorString = "<?php _('Maximum text length is: $1') ?>".replace("$1", maxFloatCorrection.toString());
          }
        }
        if (dialogInput.dataType === "Int" || dialogInput.dataType === "Double") {
          if (isNaN(value)) {
            errorString = '<?php _("Entered text is not a number") ?>';
          } else if (minFloatCorrection > value) {
            errorString = '<?php _("Minimum value is: $1") ?>'.replace("$1", minFloatCorrection.toString());
          } else if (maxFloatCorrection < value) {
            errorString = '<?php _("Maximum value is: $1") ?>'.replace("$1", maxFloatCorrection.toString());
          }
        }
        _this.inputErrors[dialogInput.name] = {
          error: errorString,
          visible: false
        };
        //console.log("getError: ", this.inputErrors[dialogInput.name]);
      }
    };

    this.roundFloat = function (val) {
      return Math.round(parseFloat(val) * 1000) / 1000;
    };
    this.getLabelStyles = function (styleNumber, marginTop, marginBottom) {
      var fontstyle = "normal";
      var fontweight = "normal";
      var fontsize = "inherit";
      if ((styleNumber & 32) === 32) {
        fontweight = "bold";
        fontsize = "xx-large";
      }
      if ((styleNumber & 16) === 16) {
        fontweight = "bold";
        fontsize = "x-large";
      }
      if ((styleNumber & 8) === 8) {
        fontstyle = "italic";
      }
      if ((styleNumber & 4) === 4) {
        fontweight = "bold";
      }
      if ((styleNumber & 2) === 2) {
        fontsize = "inherit";
      }
      if ((styleNumber & 1) === 1) {
        fontsize = "small";
      }
      return {
        "font-style": fontstyle,
        "font-weight": fontweight,
        "font-size": fontsize
      };
    };
  }],
  controllerAs: 'ctrl',
  bindings: {
    dialog: '<'
  },
  template: "<div ng-show=\"ctrl.shouldBeVisible()\" class=\"rs-dialog {{ctrl.extraClass}}\" ng-touchstart=\"ctrl.startDrag($event);\" ng-mousedown=\"ctrl.startDrag($event);\" style=\"max-height:100%; overflow: auto; width:100%; top: {{ctrl.y || 0}}px; left: {{ctrl.x || 0}}px\">\n  <div class=\"modal-header\">\n    <h3 class=\"modal-title\" \">\n      <rs-menu-icon ng-if=\"ctrl.dialog.icon !== ''\" icon-img=\"ctrl.dialog.icon\"></rs-menu-icon>\n      <i ng-if=\"ctrl.dialog.icon === ''\" class=\"{{ctrl.iconClass}}\"></i>\n      &nbsp;{{ctrl.dialog.title}}\n    </h3>\n  </div>\n  <div class=\"modal-body\">\n    <form name=\"formDialog\" class=\"customDialog\">\n      <div ng-bind-html=\"ctrl.message\"></div>\n      <small ng-if=\"ctrl.dialog.dialogType==0\"> <?php _('Note: When printer is blocking and communication buffers are full answers might not be executed!') ?></small>\n      <div ng-repeat=\"c in ctrl.dialog.input track by $index\" ng-style=\"{'margin-top':'{{c.marginTop}}', 'margin-bottom':'{{c.marginBottom}}'}\">\n        <div ng-if=\"c.inputType===0\" class=\"margin-top\">\n          <strong>{{c.caption}}</strong>\n            <input name=\"{{c.name}}\" class=\"form-control ng-pristine ng-untouched ng-valid ng-empty\"\n                   style=\"width:100%; font-color:black;\"\n                   ng-if=\"c.dataType === 'String'\"\n                   maxlength=\"{{c.maxValue}}\"\n                   minlength=\"{{c.minValue}}\"\n                   ng-required=\"c.dataType === 'String' && c.minValue !== 0\"\n                   type=\"text\"\n                   ng-model=\"ctrl.inputEntrys[c.name]\"\n                   ng-mousedown=\"$event.stopPropagation()\"\n                   ng-touchstart=\"$event.stopPropagation()\"\n                   ng-change=\"ctrl.updateError(c)\"\n                   ng-disabled=\"c.readonly\"\n                   ng-model-options=\"{ allowInvalid: true }\"\n                   >\n            <input name=\"{{c.name}}\" class=\"form-control ng-pristine ng-untouched ng-valid ng-empty\"\n                   style=\"width:100%; font-color:black;\"\n                   ng-if=\"c.dataType !== 'String'\"\n                   step=\"{{ctrl.getTypeSteps(c)}}\"\n                   min=\"{{ctrl.roundFloat(c.minValue)}}\"\n                   max=\"{{ctrl.roundFloat(c.maxValue)}}\"\n                   type=\"number\"\n                   ng-model=\"ctrl.inputEntrys[c.name]\"\n                   ng-mousedown=\"$event.stopPropagation()\"\n                   ng-touchstart=\"$event.stopPropagation()\"\n                   ng-change=\"ctrl.updateError(c)\"\n                   ng-disabled=\"c.readonly\"\n                   ng-model-options=\"{ allowInvalid: true }\"\n                   >\n        </div>\n        <strong ng-show=\"ctrl.inputErrors[c.name].visible\" style=\"color: red; font-weight: normal\" >{{ctrl.inputErrors[c.name].error}}</strong>        \n        \n        <div ng-if=\"c.inputType===1\" class=\"margin-top\">\n          <strong>{{c.caption}}</strong>\n          <select class=\"form-control ng-pristine ng-untouched ng-valid ng-not-empty\"\n                  style=\" width:100%; font-color:black;\"\n                  ng-model=\"ctrl.inputEntrys[c.name]\"\n                  ng-mousedown=\"$event.stopPropagation()\"    \n                  ng-touchstart=\"$event.stopPropagation()\"            \n                  ng-options=\"option.value as option.name for option in c.dropdownData\"\n                  ng-disabled=\"c.readonly\">\n          </select>\n        </div>\n        <div ng-if=\"c.inputType===2\" class=\"margin-top\"\">\n          <div style=\"display: flex\">\n            <label style=\"font-weight: 400;margin: 5px 0 5px 20px\" class=\"checkbox\">\n              <input\n                  type=\"checkbox\"\n                  ng-model=\"ctrl.inputEntrys[c.name]\"\n                  ng-true-value=\"'1'\"\n                  ng-false-value=\"'0'\"\n                  ng-disabled=\"c.readonly\"\n                  ng-touchstart=\"$event.stopPropagation()\"\n                  ng-mousedown=\"$event.stopPropagation()\">\n              {{c.caption}}\n            </label>\n          </div>\n        </div>\n        <label ng-if=\"c.inputType===3\" class=\"margin-top\" ng-style=\"{{ctrl.getLabelStyles(c.labelStyles)}}\">{{c.caption}}</label>\n      </div>\n    </form>\n  </div>\n  <div class=\"modal-footer\" style=\"text-align: center\" ng-if=\"ctrl.dialog.choices.length>0\">\n \n   \n    <div style=\"display: flex;flex-wrap: wrap;justify-content: space-between;margin-top:-10px\">\n      <button \n        ng-repeat=\"c in ctrl.dialog.choices track by $index\" \n        class=\"btn {{ctrl.buttonClass}}\" \n        style=\"margin-top:10px;margin-left:8px;margin-right:8px\" \n        type=\"button\" \n        ng-touchstart=\"$event.stopPropagation()\"\n        ng-click=\"ctrl.selectClose($index)\">\n         {{c}}\n      </button>\n    </div>\n  </div>\n</div>"
}).component('rsWebcam', {
  template: '<div style="{{ctrl.style}}"><img ng-src="{{ctrl.imgurl}}" alt="webcam image" style="max-width:100%"></div>',
  controller: ['$element', '$interval', '$rootScope', 'User', function ($element, $interval, $rootScope, User) {
    var cam = this;
    var lastW = 0,
      lastH = 0,
      lastUrl = "none",
      lastRot = 0;
    cam.imgurl = "";
    var stop;
    var count = 0;
    var first = true;
    var refresh = 0;
    var refreshListener = null;
    var waitLoad = false;
    cam.fullstyle = cam.style;
    var update = function update() {
      if (waitLoad) return;
      var webElem = $("img", $element);
      if (first) {
        webElem.on('load', onload);
        webElem.on('error', onerror);
        first = false;
      }
      if (webElem.length === 0) return;
      var webPar = webElem.parent();
      var originalWidth = webElem.width();
      var originalHeight = webElem.height();
      count++;
      if (cam.mjpg === false && count >= 2) {
        count = 0;
        lastW = -1;
      }
      if (refresh === 0 && lastW === originalWidth && lastH === originalHeight && lastRot === cam.rotation && lastUrl === cam.url) {
        return; // nothing changed
      }

      if (cam.url !== lastUrl) {
        var r = "rand=" + RSUtils.createAlphaID(10);
        if (cam.mjpg) {
          cam.imgurl = "/printer/previewcammjpg?url=" + encodeURIComponent(cam.url) + '&rot=' + cam.rotation + '&sess=' + User.getSessionEncoded();
        } else {
          cam.imgurl = "/printer/previewcamjpg?url=" + encodeURIComponent(cam.url) + '&rot=' + cam.rotation + '&sess=' + User.getSessionEncoded();
        }
        if (refresh > 0) refresh--;
        if (cam.imgurl.indexOf("?") > 0) cam.imgurl += "&" + r;else cam.imgurl += "?" + r;
      }
      var parentMarginTop = 0;
      var parentWidth = webPar.width();
      var scale = 1.0;
      var imgWidth, imgHeight;
      switch (cam.rotation) {
        case 0:
        case 180:
          imgWidth = originalWidth;
          imgHeight = originalHeight;
          break;
        case 90:
        case 270:
          parentMarginTop = (originalWidth - originalHeight) / 2;
          // noinspection JSSuspiciousNameCombination
          imgWidth = originalHeight;
          // noinspection JSSuspiciousNameCombination
          imgHeight = originalWidth;
          break;
      }
      if (parentWidth < imgWidth) {
        scale = parentWidth / imgWidth;
      }
      var wh = $(window).height() - 80;
      if (wh < imgHeight) {
        scale = Math.min(wh / imgHeight, scale);
      }
      if (cam.maxHeight && cam.maxHeight < imgHeight) {
        scale = Math.min(scale, cam.maxHeight / imgHeight);
      }
      var trans = "scale(" + scale + ") rotate(" + cam.rotation + "deg)";
      //var trans = "rotate("+cam.rotation+"deg)";
      webElem.css("-webkit-transform", trans);
      webElem.css("-ms-transform", trans);
      webElem.css("transform", trans);
      //webElem.css("margin-left", ((parentWidth-originalWidth)/2) + "px");
      webElem.css("margin-top", ((imgHeight * scale - originalHeight) / 2).toFixed(0) + "px");
      webElem.css("margin-left", -((originalWidth - imgWidth * scale) / 2) + "px");
      webPar.css("height", imgHeight * scale + "px");
      lastW = originalWidth;
      lastH = originalHeight;
      lastRot = cam.rotation;
      lastUrl = cam.url;
    };
    this.$onChanges = function () {
      //console.log("rsWebcam rot="+cam.rotation);
      update();
    };
    this.$onInit = function () {
      stop = $interval(update, 500);
      refreshListener = $rootScope.$on('refreshWebcam', function () {
        refresh = 2;
      });
    };
    this.$onDestroy = function () {
      $interval.cancel(stop);
      refreshListener();
      var webElem = $("img", $($element));
      if (!first) {
        webElem.off('load', onload);
        webElem.off('error', onerror);
      }
      cam.imgurl = "/img/empty.png";
      // webElem.attr("src", "/img/empty.png");
      webElem[0].src = "/img/empty.png";
      webElem[0].parentNode.textContent = "";
    };
  }],
  controllerAs: 'ctrl',
  bindings: {
    url: '<',
    mjpg: '<',
    maxHeight: '<',
    rotation: '<',
    style: '@'
  }
}).component('rsPrinterWebcam', {
  template: '<div style="{{ctrl.style}};position:relative;z-index:1;overflow:hidden;transition-duration: 300ms;transition-property: transform;{{ctrl.zoomStyle}}"><websocket-camera ng-mouseenter="ctrl.setZoom(true)" alt="zoom" ng-mouseleave="ctrl.setZoom(false)" img-url="{{ctrl.imgurl}}" rotate="ctrl.rotation" max-height="ctrl.maxHeight" style="position:relative;z-index:1;"></div>',
  controller: ['$element', '$interval', '$rootScope', 'User', 'RSCom', function ($element, $interval, $rootScope, User, RSCom) {
    var cam = this;
    cam.rotation = 0;
    cam.imgurl = "/img/nowebcam.png";
    this.zoom = false;
    var stop;
    var count = 1000;
    var index = 0;
    var refreshListener = null;
    cam.fullstyle = cam.style;
    cam.zoomStyle = '';
    var wcid = '';
    var update = function update() {
      if (cam.zoom) return;
      var config = $rootScope.printerConfig[cam.slug];
      if (!config) return;
      config = config.webcams[index];
      //console.log("cam "+cam.slug,config);
      cam.rotation = config.orientation;
      if ((config.method & 2) === 2) {
        if (!cam.url || !cam.url.startsWith("/printer/cammjpg/")) {
          cam.url = "/printer/cammjpg/" + cam.slug;
          wcid = RSUtils.createAlphaID(10);
          cam.imgurl = cam.url + "?wcid=" + wcid + "&cam=0&sess=" + User.getSessionEncoded();
        }
      } else if ((config.method & 1) === 1) {
        count++;
        if (count >= 2 * config.reloadInterval) {
          cam.url = "/printer/camjpg/" + cam.slug;
          wcid = RSUtils.createAlphaID(10);
          cam.imgurl = cam.url + "?wcid=" + wcid + "&cam=0&sess=" + User.getSessionEncoded();
          count = 0;
        }
      } else {
        cam.rotation = 0;
        cam.imgurl = cam.url = "/img/nowebcam.png";
      }
    };
    this.setZoom = function (newZoom) {
      cam.zoom = newZoom;
      if (newZoom) {
        cam.zoomStyle = "transform: scale(1.6) translate(0,25px);display:inline-block";
      } else {
        cam.zoomStyle = "display:inline-block";
      }
    };
    this.$onChanges = function () {
      //console.log("rsWebcam rot="+cam.rotation);
      update();
    };
    this.$onInit = function () {
      update();
      stop = $interval(update, 500);
      refreshListener = $rootScope.$on('refreshWebcam', function () {
        cam.url = "/img/empty.png";
        update();
      });
    };
    this.$onDestroy = function () {
      $interval.cancel(stop);
      refreshListener();
      cam.imgurl = "/img/empty.png";
    };
  }],
  controllerAs: 'ctrl',
  bindings: {
    slug: '<',
    maxHeight: '<',
    idx: '@',
    style: '@'
  }
}).directive('a', function () {
  return {
    restrict: 'E',
    link: function link(scope, elem, attrs) {
      if (attrs.ngClick || attrs.href === '' || attrs.href === '#') {
        elem.on('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
        });
      }
    }
  };
}).component('rsMenuIcon', {
  // template: '<i ng-if="!ctrl.iconImg" ng-class="[ctrl.icon, ctrl.colorClass]" class="rs-fw rs-bigtab" style="{{ctrl.style}}"></i><span ng-if="ctrl.iconImg" class="rs-fw rs-bigtab" style="display: inline-block;vertical-align: baseline;"><img style="height:19px;max-width:30px;fill:#ff0000" ng-class="ctrl.colorClass" ng-src="{{ctrl.iconImg}}"></span>',
  template: '<i ng-if="!ctrl.iconImg" ng-class="[ctrl.icon, ctrl.colorClass]" style="{{ctrl.style}}"></i>' + '<span ng-if="ctrl.iconImg" class="menuicon" style="display: inline-block;" ng-bind-html="ctrl.html">' + '</span>',
  controllerAs: 'ctrl',
  bindings: {
    iconImg: '<',
    icon: '@',
    style: '@',
    colorClass: '@'
  },
  controller: ['$sce', function ($sce) {
    var _this2 = this;
    var that = this;
    this.html = '';
    var updateIcon = function updateIcon() {
      if (!that.iconImg) {
        _this2.html = '';
        return;
      }
      // console.log('iconchange', that.iconImg)
      if (that.iconImg.substring(0, 4) === '<svg') {
        that.html = $sce.trustAsHtml(that.iconImg);
      } else if (that.iconImg.substring(0, 4) === 'http' || that.iconImg.substr(0, 4) === 'data' || that.iconImg[0] === '/') {
        if (that.iconImg.endsWith(".svg")) {
          that.html = $sce.trustAsHtml('<img style="" onload="SVGInject(this)" class="rs-icon ' + (that.colorClass ? that.colorClass : '') + '" src="' + that.iconImg + '" alt="">');
        } else {
          that.html = $sce.trustAsHtml('<img style="" class="rs-icon ' + (that.colorClass ? that.colorClass : '') + '" src="' + that.iconImg + '" alt="">');
        }
      } else {
        that.html = $sce.trustAsHtml("<i class=\"".concat(that.iconImg, "\"></i>"));
      }
      /*
              if (that.iconImg.indexOf('<svg') === 0) {
                that.html = $sce.trustAsHtml(that.iconImg)
              } else if (that.iconImg.indexOf('http') === 0 || that.iconImg.indexOf('/') === 0) {
                that.html = $sce.trustAsHtml('<img style="height:19px;max-width:30px;" class="' + that.colorClass + '" src="' + that.iconImg + '" alt="">')
              }*/
      // console.log('html now', that.html, this, that)
    };

    this.$onChanges = function (changes) {
      if (changes.iconImg) {
        updateIcon();
      }
    };
  }]
}).component('rsIcon', {
  // template: '<i ng-if="!ctrl.iconImg" ng-class="[ctrl.icon, ctrl.colorClass]" class="rs-fw rs-bigtab" style="{{ctrl.style}}"></i><span ng-if="ctrl.iconImg" class="rs-fw rs-bigtab" style="display: inline-block;vertical-align: baseline;"><img style="height:19px;max-width:30px;fill:#ff0000" ng-class="ctrl.colorClass" ng-src="{{ctrl.iconImg}}"></span>',
  template: '<i ng-if="!ctrl.iconImg" ng-class="[ctrl.icon, ctrl.colorClass]" style="{{ctrl.style}}"></i>' + '<span ng-if="ctrl.iconImg" class="rs-icon" style="" ng-bind-html="ctrl.html">' + '</span>',
  controllerAs: 'ctrl',
  bindings: {
    iconImg: '<',
    icon: '@',
    style: '@',
    colorClass: '@'
  },
  controller: ['$sce', function ($sce) {
    var _this3 = this;
    var that = this;
    this.html = '';
    var updateIcon = function updateIcon() {
      if (!that.iconImg) {
        _this3.html = '';
        return;
      }
      if (that.iconImg.substring(0, 4) === '<svg') {
        that.html = $sce.trustAsHtml(that.iconImg);
      } else if (that.iconImg.substring(0, 4) === 'http' || that.iconImg.substr(0, 4) === 'data' || that.iconImg[0] === '/') {
        if (that.iconImg.endsWith(".svg")) {
          that.html = $sce.trustAsHtml('<img style="" onload="SVGInject(this)" class="rs-icon ' + (that.colorClass ? that.colorClass : '') + '" src="' + that.iconImg + '" alt="">');
        } else {
          that.html = $sce.trustAsHtml('<img style="" class="rs-icon ' + (that.colorClass ? that.colorClass : '') + '" src="' + that.iconImg + '" alt="">');
        }
      } else {
        that.html = $sce.trustAsHtml("<i class=\"".concat(that.iconImg, "\"></i>"));
      }
      //console.log('html now', that.html, this, that)
    };

    this.$onChanges = function (changes) {
      if (changes.iconImg) {
        updateIcon();
      }
    };
  }]
})
// Modification of angular-ui-bootstrap dropdown menu to have desired behaviour
.component('rsPrintStatus', {
  controllerAs: 'ctrl',
  controller: ['$rootScope', 'User', 'RSPrinter', 'RSCom', 'Confirm', function ($rootScope, User, RSPrinter, RSCom, Confirm) {
    // this.r = $rootScope
    this.RSPrinter = RSPrinter;
    this.canPrint = User.canPrint();
    this.canFullStop = User.canFullStop() || this.canPrint;
    this.stopPrint = function () {
      Confirm("<?php _('Confirmation required') ?>", "<?php _('Really stop current print?') ?>", "<?php _('Yes') ?>", "<?php _('No') ?>", true).then(function () {
        if ($rootScope.active.status.jobid) RSCom.send("stopJob", {
          id: $rootScope.active.status.jobid
        });
      });
    };
  }],
  template: "<div class=\"margin-top panel\" ng-class=\"{'panel-default':!$root.active.status.paused,'panel-danger':$root.active.status.paused}\" ng-show=\"$root.active.state.isJobActive\">\n  <div class=\"panel-heading\" style=\"white-space: nowrap;overflow: hidden;text-overflow: ellipsis; display: flex\">\n    <i class=\"flex-pull-vertical-center rs rs-print\" ng-if=\"!$root.active.status.paused\"></i>\n    <i class=\"flex-pull-vertical-center fa fa-pause\" ng-if=\"$root.active.status.paused\"></i>\n    <div class=\"flex-pull-left margin-left-important flex-pull-vertical-center \">{{$root.active.status.job}}</div>\n    \n    <!--ng-show=\"!$root.active.status.queueCount\" ng-bind=\"printerWithJobs.length\" -->\n    <span ng-show=\"$root.active.status.repeat>1\" class=\"flex-pull-right badge\" style=\"\">{{(\"<?php _('@ remaining') ?>\").replace('@',$root.active.status.repeat-1)}}</span>\n   \n  </div>\n  <div class=\"panel-body\" style=\"height: 130px;\">\n    <table style=\"width:100%\">\n      <tr>\n        <td ng-if=\"$root.hasFeature1\" class=\"hidden-sm-600\">\n          <img ng-src=\"{{$root.RSPrinter.printingImage('m')}}\" alt=\"\" style=\"height: 130px;margin: -15px 10px -15px -15px\">\n        </td>\n        <td style=\"width:100%\">\n          <table style=\"width: 100%;white-space: nowrap;margin:-5px 0\">\n            <tr ng-show=\"$root.active.status.analysed\">\n              <td style=\"white-space: nowrap;\"><strong><?php _('ETA:') ?></strong>&nbsp;\n              </td>\n              <td style=\"padding-right: 10px;\">{{($root.stateTime + 1000*($root.active.status.printTime-$root.active.status.printedTimeComp))\n                | date:'short'}}\n              </td>\n              <td>\n                <strong class=\"hidden-xs\"><?php _('Start') ?>:</strong>\n              </td>\n              <td style=\"width: 100%\">\n                        <span class=\"hidden-xs\">\n                          {{1000*$root.active.status.printStart| date:'short'}}\n                        </span>\n              </td>\n            </tr>\n            <tr ng-show=\"$root.active.status.analysed\">\n              <td style=\"white-space: nowrap;\"><strong><?php _('ETE:') ?></strong>&nbsp;\n              </td>\n              <td style=\"padding-right: 10px;\">\n                {{$root.active.status.printTime - $root.active.status.printedTimeComp | dhms}}\n              </td>\n              <td>\n                <strong class=\"hidden-xs\"><?php _('Printing Time:') ?></strong>&nbsp;\n              </td>\n              <td>\n                        <span class=\"hidden-xs\">\n                          {{$root.stateTime/1000 - $root.active.status.printStart | hms}}</span>\n              </td>\n            </tr>\n            <tr ng-hide=\"$root.active.status.analysed\">\n              <td style=\"white-space: nowrap;\">\n                <strong><?php _('Printing Time:') ?></strong>&nbsp;\n              </td>\n              <td colspan=\"3\">{{$root.stateTime/1000 - $root.active.status.printStart | hms}}\n              </td>\n            </tr>\n            <tr>\n              <td colspan=\"4\" style=\"width: 100%;padding-top:10px\">\n                <div style=\"position: relative\">\n                  <div class=\"progress active\" style=\"margin-bottom: 0\">\n                    <div class=\"metertext\">{{$root.active.status.done | number:2}}% &nbsp;\n                      | &nbsp; <i class=\"fa fa-bars\"></i> {{$root.active.state.layer}} /\n                      {{$root.active.status.ofLayer}}\n                      <span class=\"hidden-inline-sm-400\">&nbsp; | &nbsp; Z: {{$root.active.state.z | number:2}} mm</span>\n                    </div>\n                    <div class=\"progress-bar progress-bar-success\" role=\"progressbar\"\n                         style=\"width:{{$root.active.status.done}}%\"></div>\n                  </div>\n                </div>\n              </td>\n            </tr>\n            <tr>\n              <td colspan=\"4\" style=\"padding-top: 10px\" class=\"text-right\">\n                <button ng-show=\"ctrl.canFullStop\" ng-click=\"ctrl.stopPrint()\" class=\"btn btn-danger btn-sm\" style=\"width:100px\">\n                  <i\n                      class=\"fa fa-stop\"></i> <?php _('Stop') ?>\n                </button>\n                <button ng-show=\"ctrl.canFullStop && !$root.active.status.paused\" ng-click=\"$root.RSPrinter.pausePrint()\" style=\"width:100px\" class=\"btn btn-primary btn-sm\">\n                  <i\n                      class=\"fa fa-pause\"></i>\n                    <?php _('Pause') ?>\n                </button>\n                <button ng-show=\"ctrl.canPrint && $root.active.status.paused\" ng-click=\"$root.RSPrinter.unpausePrint()\" ng-disabled=\"$root.active.status.pauseState===3\" style=\"width:100px\" class=\"btn btn-primary btn-sm\">\n                  <i class=\"fa fa-play\"></i>\n                  {{$root.RSPrinter.pauseNames[$root.active.status.pauseState]}}\n                </button>\n              </td>\n            </tr>\n          </table>\n        </td>\n      </tr>\n    </table>\n  </div>\n</div>"
}).controller('RsDropdownController', ['$scope', '$element', '$attrs', '$parse', 'uibDropdownConfig', 'uibDropdownService', '$animate', '$uibPosition', '$document', '$compile', '$templateRequest', function ($scope, $element, $attrs, $parse, dropdownConfig, uibDropdownService, $animate, $position, $document, $compile, $templateRequest) {
  var self = this,
    scope = $scope.$new(),
    // create a child scope so we are not polluting original one
    templateScope,
    appendToOpenClass = dropdownConfig.appendToOpenClass,
    openClass = dropdownConfig.openClass,
    getIsOpen,
    setIsOpen = angular.noop,
    toggleInvoker = $attrs.onToggle ? $parse($attrs.onToggle) : angular.noop,
    keynavEnabled = false;
  self.selectedOption = null;
  // body = $document.find('body')

  scope.isOpen = false;
  $element.addClass('dropdown');
  this.init = function () {
    if ($attrs.isOpen) {
      getIsOpen = $parse($attrs.isOpen);
      setIsOpen = getIsOpen.assign;
      $scope.$watch(getIsOpen, function (value) {
        scope.isOpen = !!value;
      });
    }
    keynavEnabled = angular.isDefined($attrs.keyboardNav);
  };
  this.toggle = function (open) {
    scope.isOpen = arguments.length ? !!open : !scope.isOpen;
    if (angular.isFunction(setIsOpen)) {
      setIsOpen(scope, scope.isOpen);
    }
    return scope.isOpen;
  };

  // Allow other directives to watch status
  this.isOpen = function () {
    return scope.isOpen;
  };
  scope.getToggleElement = function () {
    return self.toggleElement;
  };
  scope.getAutoClose = function () {
    return $attrs.autoClose || 'always'; //or 'outsideClick' or 'disabled'
  };

  scope.getElement = function () {
    return $element;
  };
  scope.isKeynavEnabled = function () {
    return keynavEnabled;
  };
  scope.focusDropdownEntry = function (keyCode) {
    var elems = self.dropdownMenu ?
    //If append to body is used.
    angular.element(self.dropdownMenu).find('a') : $element.find('ul').eq(0).find('a');
    switch (keyCode) {
      case 40:
        {
          if (!angular.isNumber(self.selectedOption)) {
            self.selectedOption = 0;
          } else {
            self.selectedOption = self.selectedOption === elems.length - 1 ? self.selectedOption : self.selectedOption + 1;
          }
          break;
        }
      case 38:
        {
          if (!angular.isNumber(self.selectedOption)) {
            self.selectedOption = elems.length - 1;
          } else {
            self.selectedOption = self.selectedOption === 0 ? 0 : self.selectedOption - 1;
          }
          break;
        }
    }
    elems[self.selectedOption].focus();
  };
  scope.getDropdownElement = function () {
    return self.dropdownMenu;
  };
  scope.focusToggleElement = function () {
    if (self.toggleElement) {
      self.toggleElement[0].focus();
    }
  };
  function removeDropdownMenu() {
    $element.append(self.dropdownMenu);
  }
  scope.$watch('isOpen', function (isOpen, wasOpen) {
    var appendTo = null,
      appendToBody = true;
    if (angular.isDefined($attrs.dropdownAppendTo)) {
      var appendToEl = $parse($attrs.dropdownAppendTo)(scope);
      if (appendToEl) {
        appendTo = angular.element(appendToEl);
        appendToBody = false;
      }
    }
    if (angular.isDefined($attrs.dropdownAppendToBody)) {
      var appendToBodyValue = $parse($attrs.dropdownAppendToBody)(scope);
      if (appendToBodyValue !== false) {
        appendToBody = true;
      }
    }
    if (appendToBody && !appendTo) {
      appendTo = $('#menucontainer'); // body;
    }

    if (appendTo && self.dropdownMenu) {
      if (isOpen) {
        appendTo.append(self.dropdownMenu);
        $element.on('$destroy', removeDropdownMenu);
      } else {
        $element.off('$destroy', removeDropdownMenu);
        removeDropdownMenu();
      }
    }
    if (appendTo && self.dropdownMenu) {
      var pos = $position.positionElements($element, self.dropdownMenu, 'bottom-left', true),
        css,
        rightalign,
        scrollbarPadding,
        scrollbarWidth = 0;
      css = {
        top: pos.top + 'px',
        display: isOpen ? 'block' : 'none'
      };
      var appendOffset = $position.offset(appendTo);
      css.top = pos.top - appendOffset.top + 'px';

      // rightalign = self.dropdownMenu.hasClass('dropdown-menu-right');
      var menuWidth = self.dropdownMenu.width();
      scrollbarPadding = $position.scrollbarPadding(appendTo);
      if (scrollbarPadding.heightOverflow && scrollbarPadding.scrollbarWidth) {
        scrollbarWidth = scrollbarPadding.scrollbarWidth + 2;
      }
      var maxRight = window.innerWidth - scrollbarWidth;
      rightalign = pos.left > window.innerWidth / 2;
      var left = 0,
        right = 0;
      if (false /* && window.innerWidth < 500 */) {
        css.left = '0px';
        css.right = scrollbarWidth + 'px';
        css.overflowX = 'auto';
      } else {
        var rightPos = pos.left + menuWidth;
        // console.log('lrmr', pos.left, rightPos, maxRight)
        if (!rightalign) {
          // console.log('leftalign')
          css.left = pos.left + 'px';
          css.right = 'auto';
          if (rightPos > maxRight) {
            var pl = pos.left + maxRight - rightPos;
            if (pl < 0) {
              css.left = '0px';
              css.right = scrollbarWidth + 'px';
              css.overflowX = 'auto';
            } else {
              css.left = pl + 'px';
            }
          }
          // console.log('drop start', self.dropdownMenu, self.dropdownMenu.width())
        } else {
          right = window.innerWidth - scrollbarWidth - (pos.left + $element.prop('offsetWidth'));
          left = window.innerWidth - right - menuWidth;
          // console.log('rightalign', left, right)
          if (left >= 0) {
            css.left = 'auto';
            css.right = right + 'px';
          } else {
            css.left = '0px';
            if (maxRight > menuWidth) {
              right = scrollbarWidth;
              css.right = scrollbarWidth + 'px';
              css.overflowX = 'auto';
            } else {
              css.right = 'auto';
            }
          }
        }
      }
      // Need to adjust our positioning to be relative to the appendTo container
      // if it's not the body element
      if (!appendToBody) {
        var appendOffset2 = $position.offset(appendTo);
        css.top = pos.top - appendOffset2.top + 'px';
        if (!rightalign) {
          css.left = pos.left - appendOffset2.left + 'px';
        } else {
          if (css.right !== 'auto') {
            css.right = right - appendOffset2.left + 'px'; //window.innerWidth -
            //(pos.left + appendOffset2.left + $element.prop('offsetWidth')) + 'px'
          }
        }
      }

      self.dropdownMenu.css(css);
    }
    var openContainer = appendTo ? appendTo : $element;
    var dropdownOpenClass = appendTo ? appendToOpenClass : openClass;
    var hasOpenClass = openContainer.hasClass(dropdownOpenClass);
    var isOnlyOpen = uibDropdownService.isOnlyOpen($scope, appendTo);
    if (hasOpenClass === !isOpen) {
      var toggleClass;
      if (appendTo) {
        toggleClass = !isOnlyOpen ? 'addClass' : 'removeClass';
      } else {
        toggleClass = isOpen ? 'addClass' : 'removeClass';
      }
      $animate[toggleClass](openContainer, dropdownOpenClass).then(function () {
        if (angular.isDefined(isOpen) && isOpen !== wasOpen) {
          toggleInvoker($scope, {
            open: !!isOpen
          });
        }
      });
    }
    if (isOpen) {
      if (self.dropdownMenuTemplateUrl) {
        $templateRequest(self.dropdownMenuTemplateUrl).then(function (tplContent) {
          templateScope = scope.$new();
          $compile(tplContent.trim())(templateScope, function (dropdownElement) {
            var newEl = dropdownElement;
            self.dropdownMenu.replaceWith(newEl);
            self.dropdownMenu = newEl;
            $document.on('keydown', uibDropdownService.keybindFilter);
          });
        });
      } else {
        $document.on('keydown', uibDropdownService.keybindFilter);
      }
      scope.focusToggleElement();
      uibDropdownService.open(scope, $element, appendTo);
      /* console.log('drop ele', appendTo, self.dropdownMenu, self.dropdownMenu.width())
      window.requestAnimationFrame(() => {
        console.log('frame1')
        window.requestAnimationFrame(() => {
          console.log('drop ele2', self.dropdownMenu, self.dropdownMenu.width())
         })
      })*/
    } else {
      uibDropdownService.close(scope, $element, appendTo);
      if (self.dropdownMenuTemplateUrl) {
        if (templateScope) {
          templateScope.$destroy();
        }
        var newEl = angular.element('<ul class="dropdown-menu"></ul>');
        self.dropdownMenu.replaceWith(newEl);
        self.dropdownMenu = newEl;
      }
      self.selectedOption = null;
    }
    if (angular.isFunction(setIsOpen)) {
      setIsOpen($scope, isOpen);
    }
  });
}]).directive('rsDropdown', function () {
  return {
    controller: 'RsDropdownController',
    link: function link(scope, element, attrs, dropdownCtrl) {
      dropdownCtrl.init();
    }
  };
}).directive('rsDropdownMenu', function () {
  return {
    restrict: 'A',
    require: '?^rsDropdown',
    link: function link(scope, element, attrs, dropdownCtrl) {
      if (!dropdownCtrl || angular.isDefined(attrs.dropdownNested)) {
        return;
      }
      element.addClass('dropdown-menu');
      var tplUrl = attrs.templateUrl;
      if (tplUrl) {
        dropdownCtrl.dropdownMenuTemplateUrl = tplUrl;
      }
      if (!dropdownCtrl.dropdownMenu) {
        dropdownCtrl.dropdownMenu = element;
      }
    }
  };
}).directive('rsDropdownToggle', function () {
  return {
    require: '?^rsDropdown',
    link: function link(scope, element, attrs, dropdownCtrl) {
      if (!dropdownCtrl) {
        return;
      }
      element.addClass('dropdown-toggle');
      dropdownCtrl.toggleElement = element;
      var toggleDropdown = function toggleDropdown(event) {
        event.preventDefault();
        if (!element.hasClass('disabled') && !attrs.disabled) {
          scope.$apply(function () {
            dropdownCtrl.toggle();
          });
        }
      };
      element.on('click', toggleDropdown);

      // WAI-ARIA
      element.attr({
        'aria-haspopup': true,
        'aria-expanded': false
      });
      scope.$watch(dropdownCtrl.isOpen, function (isOpen) {
        element.attr('aria-expanded', !!isOpen);
      });
      scope.$on('$destroy', function () {
        element.off('click', toggleDropdown);
      });
    }
  };
}).component('rsManual', {
  bindings: {
    sections: '='
  },
  controller: ['$element', '$scope', '$http', function ($element, $scope, $http) {
    $scope.htmlManualText = {};
    this.$onInit = function () {
      $scope.getManualText(this.sections);
    };
    $scope.getManualText = function (sections) {
      var _loop = function _loop() {
        var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2),
          name = _Object$entries$_i[0],
          caption = _Object$entries$_i[1];
        (0, _manualReader.extractManualSection)(name, $http).then(function (content) {
          var temp = {};
          temp["caption"] = caption;
          temp["htmlText"] = content;
          $scope.htmlManualText[name] = temp;
        });
      };
      for (var _i = 0, _Object$entries = Object.entries(sections); _i < _Object$entries.length; _i++) {
        _loop();
      }
    };
    $scope.setManualText = function (parent, name) {
      parent.setSelectedManualSection(name);
      $('.manualHelp', $element)[0].scrollTop = 0;
    };
  }],
  controllerAs: 'ctrl',
  template: '<div class="col-lg-3 col-md-4 col-sm-12 col-xs-12" style="height: 100%;\n' + '    display: flex;\n' + '    flex-direction: column;\n' + '    margin-bottom: 10px;">\n' + '            <select class="form-control ng-pristine ng-untouched ng-valid ng-not-empty"\n' + '                    style="width:100%"\n' + '                    ng-model="$parent.selectedManualSection"\n' + '                    ng-change="setManualText($parent, $parent.selectedManualSection)">\n' + '              <option ng-repeat="(key, value) in htmlManualText" value="{{key}}" title="{{ value.caption }}">{{ value.caption }}</option>\n' + '            </select>\n' + '            <div style="overflow-y: scroll; height: 100%; margin-bottom: 0px;" class="manualHelp panel panel-default margin-top panel-body select-text">\n' + '              <div style="margin-top: 10px; font-size: 80%" ng-bind-html="htmlManualText[$parent.selectedManualSection].htmlText" ></div>\n' + '            </div>\n' + '          </div>'
});
},{"./manualReader":106}],105:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

// Return a online status badge
RSBase.filter('online', function () {
  return function (input) {
    if (!input.active) return '<span class="label label-default label-online">' + "<?php _('Deactivated') ?>" + '</span>';
    if (input.online) {
      if (input.done) return '<span class="label label-success label-online">' + input.done.toFixed(1) + '%</span>';
      if (input.online === 1) return '<span class="label label-success label-online">' + "<?php _('Online') ?>" + '</span>';
      return '<span class="label label-warning label-online">' + "<?php _('Connected') ?>" + '</span>';
    }
    return '<span class="label label-danger label-online">' + "<?php _('Offline') ?>" + '</span>';
  };
}).filter('onlinecircle', function () {
  return function (input) {
    if (!input) return "";
    if (!input.active) return '<span style="color:#999999" title="' + "<?php _('Deactivated') ?>" + '"><i class="fa fa-power-off fa-lg"></i></span>';
    if (input.online === 1) return '<span class="fg-success" title="' + "<?php _('Online') ?>" + '"><i class="fa fa-link fa-lg"></i></span>';
    if (input.online === 2) return '<span class="fg-warning" title="' + "<?php _('Connected') ?>" + '"><i class="fa fa-signal fa-lg"></i></span>';
    return '<span class="fg-danger" title="' + "<?php _('Offline') ?>" + '"><i class="fa fa-unlink fa-lg" ></i></span>';
  };
}).filter('printerConditionIconHome', function () {
  return function (input) {
    if (!input) return "";
    if (!input.status.active) return 'fa fa-power-off';
    if (input.status.online === 0) {
      return 'fa fa-unlink';
    }
    switch (input.state.condition) {
      case 0:
        // unknown
        return 'fa fa-link';
      case 1:
        // ready
        return 'fa fa-link';
      case 2:
        // shutdown
        return 'fa fa-warning fg-warning';
      case 3:
        // killed
        return 'fa fa-exclamation';
      case 4:
        // ignoring
        return 'fa fa-warning';
      case 5:
        // offline
        return 'fa fa-power-off';
    }
    return 'fa fa-link';
  };
}).filter('printerConditionIcon', function () {
  return function (input) {
    if (!input) return "";
    if (!input.status.active) return '<span style="color:#999999"><i class="fa fa-power-off fa-lg margin-right"></i></span>';
    if (input.status.online === 0) {
      return '<span class="fg-danger"><i class="fa fa-unlink fa-lg" ></i></span>';
    }
    switch (input.state.condition) {
      case 0:
        // unknown
        return '<span class="fa fa-lg fa-question fg-gray margin-right"></span>';
      case 1:
        // ready
        return '<span class="fa fa-lg fa-check fg-success margin-right"></span>';
      case 2:
        // shutdown
        return '<span class="fa fa-lg fa-warning fg-warning margin-right"></span>';
      case 3:
        // killed
        return '<span class="fa fa-lg fa-exclamation fg-danger margin-right"></span>';
      case 4:
        // ignoring
        return '<span class="fa fa-lg fa-warning fg-warning margin-right"></span>';
      case 5:
        // offline
        return '<span class="fa fa-lg fa-power-off fg-gray margin-right"></span>';
    }
    return '';
  };
}).filter('printerConditionText', function () {
  return function (input) {
    if (!input) return "";
    if (!input.status.active) return "<?php _('Deactivated') ?>";
    if (input.status.online === 0) {
      return "<?php _('Offline') ?>";
    }
    switch (input.state.condition) {
      case 0:
        // unknown
        return "<?php _('Waiting for communication') ?>";
      case 1:
        // ready
        return "<?php _('Online') ?>";
      case 2:
        // shutdown
        return "<?php _('Shutdown') ?>";
      case 3:
        // killed
        return "<?php _('Error') ?>";
      case 4:
        // ignoring
        return "<?php _('Printer Problems') ?>";
      case 5:
        // offline
        return "<?php _('Offline') ?>";
    }
    return '';
  };
}).filter('onlineclass', function () {
  return function (input) {
    if (!input.active) return 'default';
    if (input.online === 1) return 'success';
    if (input.online === 2) return 'warning';
    return 'danger';
  };
}).filter('onlinepanel', function () {
  return function (input) {
    if (!input.active) return 'panel-default';
    if (input.online === 1) return 'panel-green';
    if (input.online === 2) return 'panel-warning';
    return 'panel-red';
  };
})
// Add temperature unit or return off
.filter('temp', function () {
  return function (input) {
    if (input === 0) return "<?php _('Off') ?>";
    if (input === -333) {
      return "<?php _('DEF') ?>";
    }
    if (input === -444) {
      return "<?php _('DEC') ?>";
    }
    return input + "°C";
  };
}).filter('printing', function () {
  return function (input) {
    if (input.job === 'none') return "<?php _('No print job running') ?>";
    return input.job;
  };
}).filter('byte', function () {
  return function (input) {
    if (input < 1024) return input + " <?php _('byte') ?>";
    input /= 1024.0;
    if (input < 1024) return input.toFixed(1) + " <?php _('kB') ?>";
    input /= 1024.0;
    if (input < 1024) return input.toFixed(1) + " <?php _('MB') ?>";
    input /= 1024.0;
    return input.toFixed(1) + " <?php _('GB') ?>";
  };
}).filter('hms', function () {
  function two_digits(a) {
    a = a.toFixed(0);
    if (a.length === 1) return "0" + a;
    return a;
  }
  return function (input) {
    if (input < 0) return "<?php _('Computing ...') ?>";
    var hours = Math.floor(input / 3600);
    input -= 3600 * hours;
    var min = Math.floor(input / 60);
    input -= min * 60;
    var t = "";
    if (hours > 0) t += hours + "h ";
    if (min > 0 || hours > 0) t += min /*two_digits(min)*/ + "m ";
    if (hours > 0) return t;
    return t + Math.round(input) /*two_digits(input)*/ + "s";
  };
}).filter('hmsFinal', function () {
  function two_digits(a) {
    a = a.toFixed(0);
    if (a.length === 1) return "0" + a;
    return a;
  }
  return function (input) {
    if (input < 0) return "0s";
    var hours = Math.floor(input / 3600);
    input -= 3600 * hours;
    var min = Math.floor(input / 60);
    input -= min * 60;
    var t = "";
    if (hours > 0) t += hours + "h ";
    if (min > 0 || hours > 0) t += min /*two_digits(min)*/ + "m ";
    if (hours > 0) return t;
    return t + Math.round(input) /*two_digits(input)*/ + "s";
  };
}).filter('dhms', function () {
  function two_digits(a) {
    a = a.toFixed(0);
    if (a.length === 1) return "0" + a;
    return a;
  }
  return function (input) {
    if (input < 0) return "<?php _('Computing ...') ?>";
    var hours = Math.floor(input / 3600);
    input -= 3600 * hours;
    var days = 0;
    if (hours > 23) {
      days = Math.floor(hours / 24);
      hours -= days * 24;
    }
    var min = Math.floor(input / 60);
    input -= min * 60;
    var t = "";
    if (days > 0) t += days + "d ";
    if (hours > 0 || days > 0) t += hours + "h ";
    if (min > 0 || hours > 0) t += two_digits(min) + "m ";
    if (days === 0) t += two_digits(input) + "s ";
    return t;
  };
}).filter('permissions', function () {
  return function (input) {
    var s = "";
    if (input & 2048) s += " / <?php _('Admin') ?>";
    if (input & 1024) s += " / <?php _('Manage Accounts') ?>";
    if (input & 4096) s += " / <?php _('Change password') ?>";
    if (input & 1) s += " / <?php _('Print') ?>";
    if (input & 512) s += " / <?php _('Full Stop / Stop / Pause / Deactivate') ?>";
    if (input & 256) s += " / <?php _('Read Files') ?>";
    if (input & 2) s += " / <?php _('Add Files') ?>";
    if (input & 4) s += " / <?php _('Remove Files') ?>";
    if (input & 8) s += " / <?php _('Configure') ?>";
    if (input & 16) s += " / <?php _('History') ?>";
    if (input & 32) s += " / <?php _('See Projects') ?>";
    if (input & 64) s += " / <?php _('Edit Projects') ?>";
    if (s.length > 0) s = s.substring(3);
    return s;
  };
}).filter('yesno', function () {
  return function (input) {
    if (input) return "<?php _('Yes') ?>";
    return "<?php _('No') ?>";
  };
}).filter('onoff', function () {
  return function (input) {
    if (input) return "<?php _('On') ?>";
    return "<?php _('Off') ?>";
  };
}).filter('convertReturn', function () {
  return function (input) {
    return input.replace(/</g, '&lt;').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
  };
}).filter('matches', function () {
  return function (items, key, val) {
    var filtered = [];
    if (items) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item[key] === val) {
          filtered.push(item);
        }
      }
    }
    return filtered;
  };
}).filter('tempRead', function () {
  return function (val, digits) {
    if (!digits) {
      digits = 0;
    }
    if (typeof val === 'undefined') {
      return "";
    }
    if (val === -333) {
      return "<?php _('DEF') ?>";
    }
    if (val === -444) {
      return "<?php _('DEC') ?>";
    }
    return val.toFixed(digits) + "°C";
  };
}).filter('cropLogName', function () {
  return function (name) {
    var croppedName = name.split('_').slice(1).join("_");
    if (croppedName.length == 0) {
      croppedName = name;
    }
    return croppedName;
  };
}).filter('tempFull', function () {
  return function (val, digits) {
    if (!digits) {
      digits = 0;
    }
    if (!val) return "";
    if (val.tempRead === -333) {
      return "<?php _('DEF') ?>";
    }
    if (val.tempRead === -444) {
      return "<?php _('DEC') ?>";
    }
    return val.tempRead.toFixed(digits) + "°C / " + (val.tempSet === 0 ? "<?php _('Off') ?>" : val.tempSet.toFixed(0) + "°C");
  };
}).filter('unsafe', ['$sce', function ($sce) {
  return function (val) {
    return $sce.trustAsHtml(val);
  };
}]);
},{}],106:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.extractManualSection = extractManualSection;
/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

var manual = null;
function extractManualSection(section, $http) {
  if (!manual) {
    manual = $http.get('/manual/index.html');
  }
  return new Promise(function (resolve, reject) {
    manual.then(function (response) {
      resolve(response.data.substring(response.data.indexOf("<!-- MARKSTART:" + section + " -->") + ("<!-- MARKSTART:" + section + " -->").length, response.data.indexOf("<!-- MARKEND:" + section + " -->")));
    }, function (err) {
      reject(err);
    });
  });
}
},{}],107:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

RSBase.directive('slider', [function () {
  return {
    scope: {
      model: '=ngModel',
      min: '@min',
      max: '@max',
      step: '@step',
      precision: '@precision',
      size: '@',
      enabled: '@',
      moved: '&'
    },
    restrict: 'A',
    replace: false,
    link: function link(scope, elem, attrs) {
      var flip = false;
      var letter = '';
      if (attrs.flip) flip = Boolean(attrs.flip);
      if (attrs.letter) letter = attrs.letter;
      var slider = $(elem).slider({
        orientation: attrs.orientation,
        step: attrs.step,
        min: 0,
        max: 100,
        flip: flip,
        letter: letter,
        formater: function formater(x) {
          return scope.$eval(x + " | number:precision");
        }
      });
      slider.on('slideStop', function (ev) {
        scope.$apply(function () {
          scope.model = parseFloat(ev.value);
          if (scope.moved) scope.moved({
            value: parseFloat(ev.value)
          });
        });
      });
      scope.$watch('model', function () {
        //console.log("model "+letter+" "+typeof(attrs.enabled)+" / "+scope.enabled+ " / v= "+scope.model+" min "+scope.min+" max "+scope.max);
        if (typeof attrs.enabled === "undefined" || Boolean(scope.enabled)) {
          //console.log("set "+scope.model+ " / "+scope.enabled);
          $(elem).slider('setValue', scope.model);
        }
      });
      scope.$watch('enabled', function () {
        $(elem).slider('setEnabled', Boolean(scope.enabled));
        if (scope.enabled) $(elem).slider('setValue', scope.model);
      });
      scope.$watch('min', function () {
        $(elem).slider("setMin", parseFloat(scope.min));
        $(elem).slider('setValue', scope.model);
      });
      scope.$watch('max', function () {
        $(elem).slider("setMax", parseFloat(scope.max));
        $(elem).slider('setValue', scope.model);
      });
      scope.$watch('step', function () {
        $(elem).slider("setStep", parseFloat(scope.step));
        $(elem).slider('setValue', scope.model);
      });
      scope.$watch('size', function () {
        $(elem).slider("setSize", parseFloat(scope.size));
        $(elem).slider('setValue', scope.model);
      });
    }
  };
}]);
},{}],108:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

RSBase.directive('autoscroll', function () {
  return {
    scope: {
      scroll: '=autoscroll'
    },
    restrict: 'A',
    link: function link(scope, elem) {
      scope.$watch('scroll', function () {
        if (scope.scroll) {
          elem[0].scrollTop = elem[0].scrollHeight;
        }
      });
      elem.bind('scroll', function () {
        scope.$apply(function () {
          if (scope.scroll) elem[0].scrollTop = elem[0].scrollHeight;
        });
      });
    }
  };
}).directive('enter', function () {
  return function (scope, element, attrs) {
    element.bind("keydown keypress", function (event) {
      if (event.which === 13) {
        scope.$apply(function () {
          scope.$eval(attrs.enter);
        });
        event.preventDefault();
      }
    });
  };
});
},{}],109:[function(require,module,exports){
"use strict";

require("../plugins/flot/jquery.flot.js");
require("../plugins/flot/jquery.flot.time.js");
require("../plugins/flot/jquery.flot.tooltip.min.js");
require("./base/RSUtils.js");
require("./base/BaseModule.js");
require("./base/basicDirectives.js");
require("./base/BasicServices.js");
require("./base/FirmwareService.js");
require("./base/PrintersService.js");
require("./base/PrinterService.js");
require("./base/Dialogs.js");
require("./base/filter.js");
require("./base/PushMessageController.js");
require("./base/RegisterController.js");
require("./base/ServerController.js");
require("./base/slider.js");
require("./base/widgets.js");
require("./user/UserModule.js");
require("./services/BrowseFolderService.js");
require("./services/ProgressService.js");
require("./base/FrontendRegistry.js");
},{"../plugins/flot/jquery.flot.js":115,"../plugins/flot/jquery.flot.time.js":116,"../plugins/flot/jquery.flot.tooltip.min.js":117,"./base/BaseModule.js":93,"./base/BasicServices.js":94,"./base/Dialogs.js":95,"./base/FirmwareService.js":96,"./base/FrontendRegistry.js":97,"./base/PrinterService.js":98,"./base/PrintersService.js":99,"./base/PushMessageController.js":100,"./base/RSUtils.js":101,"./base/RegisterController.js":102,"./base/ServerController.js":103,"./base/basicDirectives.js":104,"./base/filter.js":105,"./base/slider.js":107,"./base/widgets.js":108,"./services/BrowseFolderService.js":110,"./services/ProgressService.js":111,"./user/UserModule.js":114}],110:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

RSBase.factory('RSBrowseFolder', ['$rootScope', '$timeout', 'RSCom', function ($rootScope, $timeout, RSCom) {
  var folder = {
    selectedFolder: $rootScope.folders.length > 0 ? $rootScope.folders[0].id : 0,
    activeFolderPath: "",
    filesInPath: [],
    unfiltered: [],
    filter: "",
    useFilter: true,
    numSelected: 0
  };
  folder.toggleSelectFile = function (f) {
    if (f.isDir) {
      folder.activeFolderPath = f.path;
      folder.updateFiles("");
      return;
    }
    f.selected = !f.selected;
    folder.updateFilter();
  };
  folder.updateFilter = function () {
    folder.filesInPath = [];
    folder.numSelected = 0;
    angular.forEach(folder.unfiltered, function (v) {
      var ok = false;
      var ext = v.name.substring(v.name.lastIndexOf('.') + 1).toLowerCase();
      if (folder.useFilter === false) ok = true;else if (v.name !== ".." && v.name.startsWith(".")) ok = false;else if (v.isDir) ok = true;else if (folder.filter === "gcode" && (ext === "g" || ext === "gco" || ext === "gcode" || ext === "nc" || ext === "tap" || ext === "gcd" || ext === "dnc" || ext === "cnc" || ext === "zip" || ext === "")) ok = true;else if (folder.filter === "model" && (ext === "stl" || ext === "obj" || ext === "amf")) ok = true;
      if (ok) {
        folder.filesInPath.push(v);
        if (v.selected) {
          folder.numSelected++;
        }
      }
    });
    folder.filesInPath.sort(function (a, b) {
      if (a.isDir !== b.isDir) {
        if (a.isDir) return -1;
        return 1;
      }
      if (a.name.toLowerCase() < b.name.toLowerCase()) return -1;
      return 1;
    });
  };
  folder.updateFiles = function (next) {
    if (!next) next = "";
    RSCom.send("browseFolder", {
      folder: folder.selectedFolder,
      next: next,
      root: folder.activeFolderPath
    }).then(function (data) {
      if (data.ok) {
        folder.unfiltered = data.files;
        angular.forEach(folder.unfiltered, function (v) {
          v.selected = false;
          var ext = v.name.substr(v.name.lastIndexOf('.') + 1).toLowerCase();
          if (v.isDir) v.icon = "fa fa-folder-o";else if (ext === "g" || ext === "gco" || ext === "gcode" || ext === "nc" || ext === "tap" || ext === "cnc" || ext === "gcd" || ext === "dnc" || ext === "cnc" || ext === "") v.icon = "rs rs-file-gcode";else if (ext === "stl" || ext === "obj" || ext === "amf") v.icon = "rs rs-file-object";else if (ext === "mov" || ext === "mp4" || ext === "wmv") v.icon = "rs rs-file-video";else if (ext === "png" || ext === "gif" || ext === "jpg") v.icon = "rs rs-file-image";else if (ext === "zip") v.icon = "fa fa-file-archive-o";else v.icon = "rs rs-file";
          v.icon += " rs-bigtab";
        });
        folder.activeFolderPath = data.root;
        folder.updateFilter();
      }
    });
  };
  return folder;
}]);
},{}],111:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

RSBase.factory('WaitSelectorAppear', ['$rootScope', function ($rootScope) {
  var msgId = "";
  var progress = {};
  window.prg = progress;
  var code = '<div id="progressWindow" style="display:none"><div class="modal-backdrop in" style="z-index:5000;"></div><div class="progressWin"><h1></h1><div class="progress" style="display:block">' + '<div class="progress-bar progress-bar-success progress-bar-striped" role="progressbar" style="width: 0;">' + '</div></div></div></div>';
  $(code).prependTo($("body"));
  progress.show = function (title, percent) {
    progress.setProgress(percent);
    progress.setTitle(title);
    $("#progressWindow").show();
  };
  progress.hide = function () {
    $("#progressWindow").hide();
  };
  progress.setProgress = function (percent) {
    if (typeof percent === "undefined") percent = -1;
    if (percent < 0) {
      $("#progressWindow .progress").hide();
    } else {
      $("#progressWindow .progress").show();
      $("#progressWindow .progress-bar").css("width", percent + "%");
    }
  };
  progress.setTitle = function (title) {
    if (typeof title === "undefined") title = "";
    $("#progressWindow h1").html(title);
  };
  progress.bindToMsgId = function (id) {
    msgId = id;
  };
  $rootScope.$on("progressUpdate", function (evt, data) {
    if (data.data.msgId !== msgId) return;
    if (data.data.finished) {
      progress.hide();
    }
    progress.setProgress(data.data.progress);
  });
  $rootScope.$on("disconnected", function () {
    progress.hide();
  });
  return progress;
}]);
},{}],112:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.helper3D = exports.axisDirs = void 0;
var _Vector = require("three/src/math/Vector3.js");
var _MeshPhongMaterial = require("three/src/materials/MeshPhongMaterial.js");
var _RMFLoader = require("./RMFLoader.js");
var _constants = require("three/src/constants.js");
function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }
function _defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, _toPropertyKey(descriptor.key), descriptor); } }
function _createClass(Constructor, protoProps, staticProps) { if (protoProps) _defineProperties(Constructor.prototype, protoProps); if (staticProps) _defineProperties(Constructor, staticProps); Object.defineProperty(Constructor, "prototype", { writable: false }); return Constructor; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return _typeof(key) === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (_typeof(input) !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (_typeof(res) !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
var geometryHelper = {
  arrowX: null,
  arrowY: null,
  arrowZ: null,
  rotateX: null,
  rotateY: null,
  rotateZ: null,
  scaleX: null,
  scaleY: null,
  scaleZ: null,
  nozzle: null
};
var axisMaterials = {
  x: new _MeshPhongMaterial.MeshPhongMaterial({
    name: 'xAxisMaterial',
    color: 0xBA3129,
    specular: 0x111111,
    shininess: 50,
    side: _constants.FrontSide
  }),
  y: new _MeshPhongMaterial.MeshPhongMaterial({
    name: 'yAxisMaterial',
    color: 0x38BA1D,
    specular: 0x111111,
    shininess: 50,
    side: _constants.FrontSide
  }),
  z: new _MeshPhongMaterial.MeshPhongMaterial({
    name: 'zAxisMaterial',
    color: 0x3f51b5,
    specular: 0x111111,
    shininess: 50,
    side: _constants.FrontSide
  }),
  nozzle: new _MeshPhongMaterial.MeshPhongMaterial({
    name: 'nozzleMaterial',
    color: 0xD0A766,
    specular: 0x111111,
    shininess: 50,
    side: _constants.FrontSide,
    flatShading: true,
    transparent: true,
    opacity: 0.6
  })
};
var axisDirs = [new _Vector.Vector3(1, 0, 0), new _Vector.Vector3(0, 1, 0), new _Vector.Vector3(0, 0, 1)];

/**
 * Class to provide frequently used utility functions for 3d views
 */
exports.axisDirs = axisDirs;
var Helper3D = /*#__PURE__*/function () {
  function Helper3D() {
    _classCallCheck(this, Helper3D);
    this.openHelpers = 0;
    this._initialized = null;
  }
  _createClass(Helper3D, [{
    key: "initialized",
    get: function get() {
      var _this = this;
      if (this._initialized === null) {
        this._initialized = new Promise(function (resolve, reject) {
          _this._initResolve = resolve;
          _this._initReject = reject;
          _this.maxTextureSize = 0;
          if (geometryHelper.arrowX === null) {
            _this.loadHelper();
          }
        });
      }
      return this._initialized;
    }
  }, {
    key: "loadGeoHelper",
    value: function loadGeoHelper(name, url) {
      var _this2 = this;
      this.openHelpers++;
      // noinspection JSUnresolvedFunction
      var loader = new _RMFLoader.RMFLoader();
      loader.load(url, function (geometry) {
        geometry[0].geometry.name = name;
        geometryHelper[name] = geometry[0].geometry;
        _this2.openHelpers--;
        if (_this2.openHelpers === 0) {
          // add axis
          _this2._initResolve();
        }
      });
    }
  }, {
    key: "loadHelper",
    value: function loadHelper() {
      this.openHelpers++;
      this.loadGeoHelper("arrowX", "/views/printer/slicer/arrow2X.rmf");
      this.loadGeoHelper("arrowY", "/views/printer/slicer/arrow2Y.rmf");
      this.loadGeoHelper("arrowZ", "/views/printer/slicer/arrow2Z.rmf");
      this.loadGeoHelper("scaleX", "/views/printer/slicer/scaleX.rmf");
      this.loadGeoHelper("scaleY", "/views/printer/slicer/scaleY.rmf");
      this.loadGeoHelper("scaleZ", "/views/printer/slicer/scaleZ.rmf");
      this.loadGeoHelper("rotateX", "/views/printer/slicer/rotateX.rmf");
      this.loadGeoHelper("rotateY", "/views/printer/slicer/rotateY.rmf");
      this.loadGeoHelper("rotateZ", "/views/printer/slicer/rotateZ.rmf");
      this.loadGeoHelper("nozzle", "/views/printer/slicer/nozzle.rmf");
      this.openHelpers--;
    }
  }, {
    key: "getAxisMaterials",
    value: function getAxisMaterials() {
      return axisMaterials;
    }
  }, {
    key: "getGeometryHelper",
    value: function getGeometryHelper() {
      return geometryHelper;
    }
  }, {
    key: "getMaxTextureSize",
    value: function getMaxTextureSize() {
      if (!this.maxTextureSize) {
        var elem = document.createElement('canvas');
        var gl = elem.getContext('webgl');
        this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        gl = null;
      }
      return this.maxTextureSize;
    }
  }, {
    key: "isWebGL2Supported",
    get: function get() {
      // return false //  for testing only!
      if (!this._isWebGL2Supported) {
        this._isWebGL2Supported = function () {
          return !!document.createElement('canvas').getContext('webgl2');
        };
      }
      return this._isWebGL2Supported;
    }
  }]);
  return Helper3D;
}();
var helper3D = new Helper3D();
exports.helper3D = helper3D;
},{"./RMFLoader.js":113,"three/src/constants.js":68,"three/src/materials/MeshPhongMaterial.js":79,"three/src/math/Vector3.js":90}],113:[function(require,module,exports){
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RMFLoader = void 0;
var _FileLoader = require("three/src/loaders/FileLoader.js");
var _LoadingManager = require("three/src/loaders/LoadingManager.js");
var _BufferGeometry = require("three/src/core/BufferGeometry.js");
var _BufferAttribute = require("three/src/core/BufferAttribute.js");
/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

var RMFLoader = function RMFLoader(manager) {
  this.manager = manager !== undefined ? manager : _LoadingManager.DefaultLoadingManager;
};
exports.RMFLoader = RMFLoader;
var rmf_counter = 1;
RMFLoader.prototype = {
  constructor: RMFLoader,
  load: function load(url, onLoad, onProgress, onError) {
    var scope = this;
    var loader = new _FileLoader.FileLoader(scope.manager);
    loader.setResponseType('arraybuffer');
    var timer = "RMFLoad" + rmf_counter;
    rmf_counter++;
    // console.time(timer)
    loader.load(url, function (text) {
      onLoad(scope.parse(text, timer));
    }, onProgress, onError);
  },
  parse: function parse(data, timer) {
    var bitFix = [0, 0x1, 0x3, 0x7, 0xf, 0x1f, 0x3f, 0x7f, 0xff, 0x1ff, 0x3ff, 0x7ff, 0xfff, 0x1fff, 0x3fff, 0x7fff, 0xffff, 0x1ffff, 0x3ffff, 0x7ffff, 0xfffff, 0x1fffff, 0x3fffff, 0x7fffff, 0xffffff, 0x1ffffff, 0x3ffffff, 0x7ffffff, 0xfffffff, 0x1fffffff, 0x3fffffff, 0x7fffffff, 0xffffffff];
    function readBits(r) {
      var x;
      if (r.bitsLeft >= r.bits) {
        x = (r.bitBuffer >> r.bitsLeft - r.bits & bitFix[r.bits]) >>> 0;
        r.bitsLeft -= r.bits;
        return x;
      }
      var bitsRequired = r.bits - r.bitsLeft;
      x = (r.bitBuffer & bitFix[r.bitsLeft]) << bitsRequired;
      r.bitBuffer = r.reader.getUint32(r.pos, true);
      r.pos += 4;
      r.bitsLeft = 32 - bitsRequired;
      x = (x | r.bitBuffer >> r.bitsLeft & bitFix[bitsRequired]) >>> 0;
      return x;
    }
    var reader = new DataView(data);
    var geometry = new _BufferGeometry.BufferGeometry();
    var index = 8;
    var pos;
    // File must start with '@rmf' or it is a different format
    if (reader.getUint8(0) !== 0x40 || reader.getUint8(1) !== 0x72 || reader.getUint8(2) !== 0x6d || reader.getUint8(3) !== 0x66) {
      console.error('wrong format ', reader.getUint8(0), reader.getUint8(1), reader.getUint8(2), reader.getUint8(3));
      return null;
    }
    var version = reader.getUint32(4, true);
    // console.log('Version', version)
    var positions = undefined;
    var indices = undefined;
    var decoder = new TextDecoder('utf-8');
    var params = {};
    var result = [];
    function readString() {
      var startIdx = pos;
      while (reader.getUint8(pos)) {
        pos++;
      }
      var len = pos - startIdx;
      pos++;
      var buf = new Uint8Array(len);
      for (var i = 0; i < len; i++) {
        buf[i] = reader.getUint8(startIdx + i);
      }
      return decoder.decode(buf);
    }
    function addObject() {
      if (indices === undefined) {
        return;
      }
      geometry.setIndex(new _BufferAttribute.BufferAttribute(indices, 1));
      geometry.setAttribute('position', new _BufferAttribute.BufferAttribute(positions, 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      result.push({
        geometry: geometry,
        params: params
      });
      params = {};
      geometry = new _BufferGeometry.BufferGeometry();
    }
    while (index < reader.byteLength) {
      var id = reader.getUint32(index, true);
      var size = reader.getUint32(index + 4, true);
      index += 8;
      switch (id) {
        case 2:
          // new object start
          addObject();
          pos = index;
          var nParams = reader.getUint32(pos, true);
          pos += 4;
          for (var i = 0; i < nParams; i++) {
            var key = readString();
            params[key] = readString();
          }
          index += size;
          break;
        case 3:
          // points
          {
            var nPoints = size / 4;
            positions = new Float32Array(nPoints);
            for (var p = 0; p < nPoints; p++) {
              positions[p] = reader.getFloat32(index + p * 4, true);
            }
            index += size;
          }
          break;
        case 4:
          // face index
          {
            pos = index;
            var bits = reader.getUint32(pos, true);
            var nFaces = reader.getUint32(pos + 4, true);
            pos += 8;
            if (nFaces * 3 < 65535) {
              indices = new Uint16Array(nFaces * 3);
            } else {
              indices = new Uint32Array(nFaces * 3);
            }
            var bitPos = {
              reader: reader,
              pos: pos,
              bitBuffer: 0,
              bitsLeft: 0,
              bits: bits
            };
            for (var _i = 0; _i < nFaces * 3; _i++) {
              indices[_i] = readBits(bitPos);
            }
          }
          index += size;
          break;
        case 0x666d7240:
          // concatenation id
          version = size;
          size = 8;
          break;
        default:
          index += size;
      }
      if (size === 0) {
        break;
      }
    }
    addObject();
    // console.timeEnd(timer)
    return result;
  }
};
},{"three/src/core/BufferAttribute.js":69,"three/src/core/BufferGeometry.js":70,"three/src/loaders/FileLoader.js":75,"three/src/loaders/LoadingManager.js":77}],114:[function(require,module,exports){
"use strict";

/*
 Copyright 2011-2022 Hot-World GmbH & Co. KG
 All Rights Reserved

 We grand the right to use these sources for derivatives of the user interface
 to be used with Repetier-Server. Usage for other software products is not permitted.
 */

// Dummy variable to resolve unused variables for unknown json data
//noinspection JSUnusedLocalSymbols
var dummy = {
  permPrint: undefined,
  permConfig: undefined,
  permAdd: undefined,
  permDel: undefined,
  seePermission: undefined,
  editPermission: undefined
};
window.RSUserModule = angular.module('RSUser', ['ui.router', 'RSBase', 'LocalStorageModule']).factory('User', ['$rootScope', '$location', '$q', 'localStorageService', '$state', 'Theme', function ($rootScope, $location, $q, localStorageService, $state, Theme) {
  var permissions = 15; // No user system active - allow anything
  var login = '',
    password = '',
    session = localStorageService.get("session");
  if (session) {
    login = session.login;
    session = session.session;
  }
  function removeLoginParams() {
    var urlOrig = window.location.href;
    var fragment = '';
    var fragPos = urlOrig.indexOf('#');
    if (fragPos > -1) {
      fragment = urlOrig.substr(fragPos);
      urlOrig = urlOrig.substr(0, fragPos);
    }
    var url = urlOrig.split('?')[0] + '?';
    var sPageURL = decodeURIComponent(window.location.search.substring(1)),
      sURLVariables = sPageURL.split('&'),
      sParameterName;
    var found = false;
    for (var i = 0; i < sURLVariables.length; i++) {
      sParameterName = sURLVariables[i].split('=');
      if (sParameterName[0] !== 'login' && sParameterName[0] !== 'password') {
        url = url + sParameterName[0] + '=' + sParameterName[1] + '&';
      } else {
        found = true;
      }
    }
    url = url.substring(0, url.length - 1) + fragment;
    // window.history.replaceState({}, document.title, url);
    if (found) {
      // $location.path(url)
      window.location.href = url;
    }
  }
  if (window.login && window.password) {
    login = window.login;
    password = window.password;
  }
  var _loggedIn = false;
  var sessionStartedPromise = $q.defer();
  var settings = {}; // List of user settings
  var autologinSend = false;
  var service = {
    isLoggedIn: false,
    isRealUser: false,
    loggedIn: function loggedIn() {
      return _loggedIn | (login === '' && permissions !== 0);
    },
    realUser: function realUser() {
      return login !== '' && login !== 'global';
    },
    canPrint: function canPrint() {
      return (permissions & 1) === 1;
    },
    canAddFiles: function canAddFiles() {
      return (permissions & 2) === 2;
    },
    canDeleteFiles: function canDeleteFiles() {
      return (permissions & 4) === 4;
    },
    canChangeConfig: function canChangeConfig() {
      return (permissions & 8) === 8;
    },
    canHistory: function canHistory() {
      return (permissions & 16) === 16;
    },
    canSeeProjects: function canSeeProjects() {
      return (permissions & 32) === 32;
    },
    canEditProjects: function canEditProjects() {
      return (permissions & 64) === 64;
    },
    canReadFiles: function canReadFiles() {
      return (permissions & 256) === 256;
    },
    canFullStop: function canFullStop() {
      return (permissions & 512) === 512;
    },
    canManageAccounts: function canManageAccounts() {
      return (permissions & 1024) === 1024;
    },
    isAdmin: function isAdmin() {
      return (permissions & 2048) === 2048;
    },
    canChangePassword: function canChangePassword() {
      return (permissions & 6144) !== 0;
    },
    getSession: function getSession() {
      return session;
    },
    getSessionEncoded: function getSessionEncoded() {
      return encodeURIComponent(session);
    },
    setSession: function setSession(_session) {
      session = _session;
      localStorageService.set("session", {
        user: login,
        session: _session
      });
      sessionStartedPromise.resolve();
    },
    getLogin: function getLogin() {
      return login;
    },
    printPermission: false,
    readPermission: false,
    addPermission: false,
    delPermission: false,
    changeConfigPermission: false,
    historyPermission: false,
    seeProjectsPermission: false,
    editProjectsPermission: false,
    fullStopPermission: false,
    manageAccountsPermission: false,
    adminPermission: false,
    changePasswordPermission: false,
    sessionStarted: function sessionStarted() {
      return sessionStartedPromise.promise;
    },
    getSetting: function getSetting(name, def) {
      if (typeof settings[name] === 'undefined') {
        $rootScope.RSCom.send("updateUserSetting", {
          key: name,
          value: def
        });
        settings[name] = def;
      }
      return settings[name];
    },
    setSetting: function setSetting(name, newValue) {
      if (settings[name] === newValue) return;
      settings[name] = newValue;
      $rootScope.RSCom.send("updateUserSetting", {
        key: name,
        value: newValue
      });
      $rootScope.$broadcast('userSettingsChanged');
    },
    setCredentials: function setCredentials(_login, _pw) {
      login = _login;
      password = _pw;
    }
  };
  var updateExtCommands = function updateExtCommands() {
    var a = [];
    angular.forEach($rootScope.externalCommands, function (test) {
      if (test.permPrint && !service.printPermission) return;
      if (test.permConfig && !service.changeConfigPermission) return;
      if (test.permAdd && !service.addPermission) return;
      if (test.permDel && !service.delPermission) return;
      a.push(test);
    });
    $rootScope.externalCommandsFiltered = a;
  };
  service.logout = function () {
    service.setPermissions(0);
    login = "";
    password = "";
    _loggedIn = false;
    service.isLoggedIn = false;
    service.isRealUser = false;
    $rootScope.RSCom.send("logout", {});
    localStorageService.remove("session");
    $state.go("login");
  };
  service.logoutFromOutside = function () {
    service.setPermissions(0);
    login = "";
    password = "";
    _loggedIn = false;
    service.isLoggedIn = false;
    service.isRealUser = false;
    localStorageService.remove("session");
    $state.go("login");
  };
  service.setPermissions = function (perm) {
    permissions = perm;
    service.permissions = perm;
    service.printPermission = service.canPrint();
    service.readPermission = service.canReadFiles();
    service.addPermission = service.canAddFiles();
    service.delPermission = service.canDeleteFiles();
    service.changeConfigPermission = service.canChangeConfig();
    service.historyPermission = service.canHistory();
    service.seeProjectsPermission = service.canSeeProjects();
    service.editProjectsPermission = service.canEditProjects();
    service.fullStopPermission = service.canFullStop();
    service.manageAccountsPermission = service.canManageAccounts();
    service.adminPermission = service.isAdmin();
    service.changePasswordPermission = service.canChangePassword();
    $rootScope.frontend.visible["user.printPermission"] = service.printPermission;
    $rootScope.frontend.visible["user.addPermission"] = service.addPermission;
    $rootScope.frontend.visible["user.readPermission"] = service.readPermission;
    $rootScope.frontend.visible["user.delPermission"] = service.delPermission;
    $rootScope.frontend.visible["user.changeConfigPermission"] = service.changeConfigPermission;
    $rootScope.frontend.visible["user.historyPermission"] = service.historyPermission;
    $rootScope.frontend.visible["user.seeProjectsPermission"] = service.seePermission;
    $rootScope.frontend.visible["user.editProjectsPermission"] = service.editPermission;
    $rootScope.frontend.visible["user.fullStopPermission"] = service.fullStopPermission;
    updateExtCommands();
  };
  service.autologin = function (RSCom) {
    if (autologinSend || _loggedIn || !password) {
      return false;
    }
    _loggedIn = false;
    autologinSend = true;
    if (login === '') {
      return false;
    }
    RSCom.send("login", {
      login: login,
      password: CryptoJS.MD5(session + CryptoJS.MD5(login + password).toString()).toString()
      // password: CryptoJS.MD5(session + password).toString()
    }).then(function (data) {
      if (data.error) {
        $rootScope.loginerror = data.error;
        $location.path('/login');
      } else {
        _loggedIn = true;
        if (typeof $rootScope.pathAfterLogin == "undefined" || $rootScope.pathAfterLogin === "/login") {
          $rootScope.pathAfterLogin = "/";
        }
        $location.path($rootScope.pathAfterLogin);
        settings = data.settings;
        $rootScope.$broadcast("connected");
      }
    });
    return true;
  };
  service.setCredentialsFromServer = function (data) {
    var oldLoggedIn = _loggedIn;
    _loggedIn = true;
    service.setPermissions(data.permissions);
    login = data.login;
    settings = data.settings;
    service.isLoggedIn = service.loggedIn();
    service.isRealUser = service.realUser();
    localStorageService.set("session", {
      user: data.login,
      session: session
    });
    removeLoginParams();
    if (!oldLoggedIn) $rootScope.$broadcast("connected");
    // $rootScope.$broadcast("userCredentialsStored");
    if ($state.is('login')) $state.go('home');
    var theme = service.getSetting('theme', 'auto');
    Theme.setMode(theme);
    sessionStartedPromise.resolve();
    $rootScope.$broadcast("userSettingsChanged");
  };
  $rootScope.$on('userCredentials', function (event, data) {
    service.setCredentialsFromServer(data.data);
  });
  $rootScope.$on('logout', function () {
    // user got deleted
    service.logoutFromOutside();
  });
  $rootScope.$on("disconnected", function () {
    autologinSend = false;
  });
  $rootScope.$on("externalCommandsChanged", function () {
    updateExtCommands();
  });
  return service;
}]);
},{}],115:[function(require,module,exports){
"use strict";

function _typeof(obj) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (obj) { return typeof obj; } : function (obj) { return obj && "function" == typeof Symbol && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; }, _typeof(obj); }
/* Javascript plotting library for jQuery, version 0.8.3.

Copyright (c) 2007-2014 IOLA and Ole Laursen.
Licensed under the MIT license.

*/

// first an inline dependency, jquery.colorhelpers.js, we inline it here
// for convenience

/* Plugin for jQuery for working with colors.
 *
 * Version 1.1.
 *
 * Inspiration from jQuery color animation plugin by John Resig.
 *
 * Released under the MIT license by Ole Laursen, October 2009.
 *
 * Examples:
 *
 *   $.color.parse("#fff").scale('rgb', 0.25).add('a', -0.5).toString()
 *   var c = $.color.extract($("#mydiv"), 'background-color');
 *   console.log(c.r, c.g, c.b, c.a);
 *   $.color.make(100, 50, 25, 0.4).toString() // returns "rgba(100,50,25,0.4)"
 *
 * Note that .scale() and .add() return the same modified object
 * instead of making a new one.
 *
 * V. 1.1: Fix error handling so e.g. parsing an empty string does
 * produce a color rather than just crashing.
 */
(function ($) {
  $.color = {};
  $.color.make = function (r, g, b, a) {
    var o = {};
    o.r = r || 0;
    o.g = g || 0;
    o.b = b || 0;
    o.a = a != null ? a : 1;
    o.add = function (c, d) {
      for (var i = 0; i < c.length; ++i) o[c.charAt(i)] += d;
      return o.normalize();
    };
    o.scale = function (c, f) {
      for (var i = 0; i < c.length; ++i) o[c.charAt(i)] *= f;
      return o.normalize();
    };
    o.toString = function () {
      if (o.a >= 1) {
        return "rgb(" + [o.r, o.g, o.b].join(",") + ")";
      } else {
        return "rgba(" + [o.r, o.g, o.b, o.a].join(",") + ")";
      }
    };
    o.normalize = function () {
      function clamp(min, value, max) {
        return value < min ? min : value > max ? max : value;
      }
      o.r = clamp(0, parseInt(o.r), 255);
      o.g = clamp(0, parseInt(o.g), 255);
      o.b = clamp(0, parseInt(o.b), 255);
      o.a = clamp(0, o.a, 1);
      return o;
    };
    o.clone = function () {
      return $.color.make(o.r, o.b, o.g, o.a);
    };
    return o.normalize();
  };
  $.color.extract = function (elem, css) {
    var c;
    do {
      c = elem.css(css).toLowerCase();
      if (c != "" && c != "transparent") break;
      elem = elem.parent();
    } while (elem.length && !$.nodeName(elem.get(0), "body"));
    if (c == "rgba(0, 0, 0, 0)") c = "transparent";
    return $.color.parse(c);
  };
  $.color.parse = function (str) {
    var res,
      m = $.color.make;
    if (res = /rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)/.exec(str)) return m(parseInt(res[1], 10), parseInt(res[2], 10), parseInt(res[3], 10));
    if (res = /rgba\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(str)) return m(parseInt(res[1], 10), parseInt(res[2], 10), parseInt(res[3], 10), parseFloat(res[4]));
    if (res = /rgb\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*\)/.exec(str)) return m(parseFloat(res[1]) * 2.55, parseFloat(res[2]) * 2.55, parseFloat(res[3]) * 2.55);
    if (res = /rgba\(\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\%\s*,\s*([0-9]+(?:\.[0-9]+)?)\s*\)/.exec(str)) return m(parseFloat(res[1]) * 2.55, parseFloat(res[2]) * 2.55, parseFloat(res[3]) * 2.55, parseFloat(res[4]));
    if (res = /#([a-fA-F0-9]{2})([a-fA-F0-9]{2})([a-fA-F0-9]{2})/.exec(str)) return m(parseInt(res[1], 16), parseInt(res[2], 16), parseInt(res[3], 16));
    if (res = /#([a-fA-F0-9])([a-fA-F0-9])([a-fA-F0-9])/.exec(str)) return m(parseInt(res[1] + res[1], 16), parseInt(res[2] + res[2], 16), parseInt(res[3] + res[3], 16));
    var name = $.trim(str).toLowerCase();
    if (name == "transparent") return m(255, 255, 255, 0);else {
      res = lookupColors[name] || [0, 0, 0];
      return m(res[0], res[1], res[2]);
    }
  };
  var lookupColors = {
    aqua: [0, 255, 255],
    azure: [240, 255, 255],
    beige: [245, 245, 220],
    black: [0, 0, 0],
    blue: [0, 0, 255],
    brown: [165, 42, 42],
    cyan: [0, 255, 255],
    darkblue: [0, 0, 139],
    darkcyan: [0, 139, 139],
    darkgrey: [169, 169, 169],
    darkgreen: [0, 100, 0],
    darkkhaki: [189, 183, 107],
    darkmagenta: [139, 0, 139],
    darkolivegreen: [85, 107, 47],
    darkorange: [255, 140, 0],
    darkorchid: [153, 50, 204],
    darkred: [139, 0, 0],
    darksalmon: [233, 150, 122],
    darkviolet: [148, 0, 211],
    fuchsia: [255, 0, 255],
    gold: [255, 215, 0],
    green: [0, 128, 0],
    indigo: [75, 0, 130],
    khaki: [240, 230, 140],
    lightblue: [173, 216, 230],
    lightcyan: [224, 255, 255],
    lightgreen: [144, 238, 144],
    lightgrey: [211, 211, 211],
    lightpink: [255, 182, 193],
    lightyellow: [255, 255, 224],
    lime: [0, 255, 0],
    magenta: [255, 0, 255],
    maroon: [128, 0, 0],
    navy: [0, 0, 128],
    olive: [128, 128, 0],
    orange: [255, 165, 0],
    pink: [255, 192, 203],
    purple: [128, 0, 128],
    violet: [128, 0, 128],
    red: [255, 0, 0],
    silver: [192, 192, 192],
    white: [255, 255, 255],
    yellow: [255, 255, 0]
  };
})(jQuery);

// the actual Flot code
(function ($) {
  // Cache the prototype hasOwnProperty for faster access

  var hasOwnProperty = Object.prototype.hasOwnProperty;

  // A shim to provide 'detach' to jQuery versions prior to 1.4.  Using a DOM
  // operation produces the same effect as detach, i.e. removing the element
  // without touching its jQuery data.

  // Do not merge this into Flot 0.9, since it requires jQuery 1.4.4+.

  if (!$.fn.detach) {
    $.fn.detach = function () {
      return this.each(function () {
        if (this.parentNode) {
          this.parentNode.removeChild(this);
        }
      });
    };
  }

  ///////////////////////////////////////////////////////////////////////////
  // The Canvas object is a wrapper around an HTML5 <canvas> tag.
  //
  // @constructor
  // @param {string} cls List of classes to apply to the canvas.
  // @param {element} container Element onto which to append the canvas.
  //
  // Requiring a container is a little iffy, but unfortunately canvas
  // operations don't work unless the canvas is attached to the DOM.

  function Canvas(cls, container) {
    var element = container.children("." + cls)[0];
    if (element == null) {
      element = document.createElement("canvas");
      element.className = cls;
      $(element).css({
        direction: "ltr",
        position: "absolute",
        left: 0,
        top: 0
      }).appendTo(container);

      // If HTML5 Canvas isn't available, fall back to [Ex|Flash]canvas

      if (!element.getContext) {
        if (window.G_vmlCanvasManager) {
          element = window.G_vmlCanvasManager.initElement(element);
        } else {
          throw new Error("Canvas is not available. If you're using IE with a fall-back such as Excanvas, then there's either a mistake in your conditional include, or the page has no DOCTYPE and is rendering in Quirks Mode.");
        }
      }
    }
    this.element = element;
    var context = this.context = element.getContext("2d");

    // Determine the screen's ratio of physical to device-independent
    // pixels.  This is the ratio between the canvas width that the browser
    // advertises and the number of pixels actually present in that space.

    // The iPhone 4, for example, has a device-independent width of 320px,
    // but its screen is actually 640px wide.  It therefore has a pixel
    // ratio of 2, while most normal devices have a ratio of 1.

    var devicePixelRatio = window.devicePixelRatio || 1,
      backingStoreRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio || context.backingStorePixelRatio || 1;
    this.pixelRatio = devicePixelRatio / backingStoreRatio;

    // Size the canvas to match the internal dimensions of its container

    this.resize(container.width(), container.height());

    // Collection of HTML div layers for text overlaid onto the canvas

    this.textContainer = null;
    this.text = {};

    // Cache of text fragments and metrics, so we can avoid expensively
    // re-calculating them when the plot is re-rendered in a loop.

    this._textCache = {};
  }

  // Resizes the canvas to the given dimensions.
  //
  // @param {number} width New width of the canvas, in pixels.
  // @param {number} width New height of the canvas, in pixels.

  Canvas.prototype.resize = function (width, height) {
    if (width <= 0 || height <= 0) {
      throw new Error("Invalid dimensions for plot, width = " + width + ", height = " + height);
    }
    var element = this.element,
      context = this.context,
      pixelRatio = this.pixelRatio;

    // Resize the canvas, increasing its density based on the display's
    // pixel ratio; basically giving it more pixels without increasing the
    // size of its element, to take advantage of the fact that retina
    // displays have that many more pixels in the same advertised space.

    // Resizing should reset the state (excanvas seems to be buggy though)

    if (this.width != width) {
      element.width = width * pixelRatio;
      element.style.width = width + "px";
      this.width = width;
    }
    if (this.height != height) {
      element.height = height * pixelRatio;
      element.style.height = height + "px";
      this.height = height;
    }

    // Save the context, so we can reset in case we get replotted.  The
    // restore ensure that we're really back at the initial state, and
    // should be safe even if we haven't saved the initial state yet.

    context.restore();
    context.save();

    // Scale the coordinate space to match the display density; so even though we
    // may have twice as many pixels, we still want lines and other drawing to
    // appear at the same size; the extra pixels will just make them crisper.

    context.scale(pixelRatio, pixelRatio);
  };

  // Clears the entire canvas area, not including any overlaid HTML text

  Canvas.prototype.clear = function () {
    this.context.clearRect(0, 0, this.width, this.height);
  };

  // Finishes rendering the canvas, including managing the text overlay.

  Canvas.prototype.render = function () {
    var cache = this._textCache;

    // For each text layer, add elements marked as active that haven't
    // already been rendered, and remove those that are no longer active.

    for (var layerKey in cache) {
      if (hasOwnProperty.call(cache, layerKey)) {
        var layer = this.getTextLayer(layerKey),
          layerCache = cache[layerKey];
        layer.hide();
        for (var styleKey in layerCache) {
          if (hasOwnProperty.call(layerCache, styleKey)) {
            var styleCache = layerCache[styleKey];
            for (var key in styleCache) {
              if (hasOwnProperty.call(styleCache, key)) {
                var positions = styleCache[key].positions;
                for (var i = 0, position; position = positions[i]; i++) {
                  if (position.active) {
                    if (!position.rendered) {
                      layer.append(position.element);
                      position.rendered = true;
                    }
                  } else {
                    positions.splice(i--, 1);
                    if (position.rendered) {
                      position.element.detach();
                    }
                  }
                }
                if (positions.length == 0) {
                  delete styleCache[key];
                }
              }
            }
          }
        }
        layer.show();
      }
    }
  };

  // Creates (if necessary) and returns the text overlay container.
  //
  // @param {string} classes String of space-separated CSS classes used to
  //     uniquely identify the text layer.
  // @return {object} The jQuery-wrapped text-layer div.

  Canvas.prototype.getTextLayer = function (classes) {
    var layer = this.text[classes];

    // Create the text layer if it doesn't exist

    if (layer == null) {
      // Create the text layer container, if it doesn't exist

      if (this.textContainer == null) {
        this.textContainer = $("<div class='flot-text'></div>").css({
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          'font-size': "smaller",
          color: "#545454"
        }).insertAfter(this.element);
      }
      layer = this.text[classes] = $("<div></div>").addClass(classes).css({
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        right: 0
      }).appendTo(this.textContainer);
    }
    return layer;
  };

  // Creates (if necessary) and returns a text info object.
  //
  // The object looks like this:
  //
  // {
  //     width: Width of the text's wrapper div.
  //     height: Height of the text's wrapper div.
  //     element: The jQuery-wrapped HTML div containing the text.
  //     positions: Array of positions at which this text is drawn.
  // }
  //
  // The positions array contains objects that look like this:
  //
  // {
  //     active: Flag indicating whether the text should be visible.
  //     rendered: Flag indicating whether the text is currently visible.
  //     element: The jQuery-wrapped HTML div containing the text.
  //     x: X coordinate at which to draw the text.
  //     y: Y coordinate at which to draw the text.
  // }
  //
  // Each position after the first receives a clone of the original element.
  //
  // The idea is that that the width, height, and general 'identity' of the
  // text is constant no matter where it is placed; the placements are a
  // secondary property.
  //
  // Canvas maintains a cache of recently-used text info objects; getTextInfo
  // either returns the cached element or creates a new entry.
  //
  // @param {string} layer A string of space-separated CSS classes uniquely
  //     identifying the layer containing this text.
  // @param {string} text Text string to retrieve info for.
  // @param {(string|object)=} font Either a string of space-separated CSS
  //     classes or a font-spec object, defining the text's font and style.
  // @param {number=} angle Angle at which to rotate the text, in degrees.
  //     Angle is currently unused, it will be implemented in the future.
  // @param {number=} width Maximum width of the text before it wraps.
  // @return {object} a text info object.

  Canvas.prototype.getTextInfo = function (layer, text, font, angle, width) {
    var textStyle, layerCache, styleCache, info;

    // Cast the value to a string, in case we were given a number or such

    text = "" + text;

    // If the font is a font-spec object, generate a CSS font definition

    if (_typeof(font) === "object") {
      textStyle = font.style + " " + font.variant + " " + font.weight + " " + font.size + "px/" + font.lineHeight + "px " + font.family;
    } else {
      textStyle = font;
    }

    // Retrieve (or create) the cache for the text's layer and styles

    layerCache = this._textCache[layer];
    if (layerCache == null) {
      layerCache = this._textCache[layer] = {};
    }
    styleCache = layerCache[textStyle];
    if (styleCache == null) {
      styleCache = layerCache[textStyle] = {};
    }
    info = styleCache[text];

    // If we can't find a matching element in our cache, create a new one

    if (info == null) {
      var element = $("<div></div>").html(text).css({
        position: "absolute",
        'max-width': width,
        top: -9999
      }).appendTo(this.getTextLayer(layer));
      if (_typeof(font) === "object") {
        element.css({
          font: textStyle,
          color: font.color
        });
      } else if (typeof font === "string") {
        element.addClass(font);
      }
      info = styleCache[text] = {
        width: element.outerWidth(true),
        height: element.outerHeight(true),
        element: element,
        positions: []
      };
      element.detach();
    }
    return info;
  };

  // Adds a text string to the canvas text overlay.
  //
  // The text isn't drawn immediately; it is marked as rendering, which will
  // result in its addition to the canvas on the next render pass.
  //
  // @param {string} layer A string of space-separated CSS classes uniquely
  //     identifying the layer containing this text.
  // @param {number} x X coordinate at which to draw the text.
  // @param {number} y Y coordinate at which to draw the text.
  // @param {string} text Text string to draw.
  // @param {(string|object)=} font Either a string of space-separated CSS
  //     classes or a font-spec object, defining the text's font and style.
  // @param {number=} angle Angle at which to rotate the text, in degrees.
  //     Angle is currently unused, it will be implemented in the future.
  // @param {number=} width Maximum width of the text before it wraps.
  // @param {string=} halign Horizontal alignment of the text; either "left",
  //     "center" or "right".
  // @param {string=} valign Vertical alignment of the text; either "top",
  //     "middle" or "bottom".

  Canvas.prototype.addText = function (layer, x, y, text, font, angle, width, halign, valign) {
    var info = this.getTextInfo(layer, text, font, angle, width),
      positions = info.positions;

    // Tweak the div's position to match the text's alignment

    if (halign == "center") {
      x -= info.width / 2;
    } else if (halign == "right") {
      x -= info.width;
    }
    if (valign == "middle") {
      y -= info.height / 2;
    } else if (valign == "bottom") {
      y -= info.height;
    }

    // Determine whether this text already exists at this position.
    // If so, mark it for inclusion in the next render pass.

    for (var i = 0, position; position = positions[i]; i++) {
      if (position.x == x && position.y == y) {
        position.active = true;
        return;
      }
    }

    // If the text doesn't exist at this position, create a new entry

    // For the very first position we'll re-use the original element,
    // while for subsequent ones we'll clone it.

    position = {
      active: true,
      rendered: false,
      element: positions.length ? info.element.clone() : info.element,
      x: x,
      y: y
    };
    positions.push(position);

    // Move the element to its final position within the container

    position.element.css({
      top: Math.round(y),
      left: Math.round(x),
      'text-align': halign // In case the text wraps
    });
  };

  // Removes one or more text strings from the canvas text overlay.
  //
  // If no parameters are given, all text within the layer is removed.
  //
  // Note that the text is not immediately removed; it is simply marked as
  // inactive, which will result in its removal on the next render pass.
  // This avoids the performance penalty for 'clear and redraw' behavior,
  // where we potentially get rid of all text on a layer, but will likely
  // add back most or all of it later, as when redrawing axes, for example.
  //
  // @param {string} layer A string of space-separated CSS classes uniquely
  //     identifying the layer containing this text.
  // @param {number=} x X coordinate of the text.
  // @param {number=} y Y coordinate of the text.
  // @param {string=} text Text string to remove.
  // @param {(string|object)=} font Either a string of space-separated CSS
  //     classes or a font-spec object, defining the text's font and style.
  // @param {number=} angle Angle at which the text is rotated, in degrees.
  //     Angle is currently unused, it will be implemented in the future.

  Canvas.prototype.removeText = function (layer, x, y, text, font, angle) {
    if (text == null) {
      var layerCache = this._textCache[layer];
      if (layerCache != null) {
        for (var styleKey in layerCache) {
          if (hasOwnProperty.call(layerCache, styleKey)) {
            var styleCache = layerCache[styleKey];
            for (var key in styleCache) {
              if (hasOwnProperty.call(styleCache, key)) {
                var positions = styleCache[key].positions;
                for (var i = 0, position; position = positions[i]; i++) {
                  position.active = false;
                }
              }
            }
          }
        }
      }
    } else {
      var positions = this.getTextInfo(layer, text, font, angle).positions;
      for (var i = 0, position; position = positions[i]; i++) {
        if (position.x == x && position.y == y) {
          position.active = false;
        }
      }
    }
  };

  ///////////////////////////////////////////////////////////////////////////
  // The top-level container for the entire plot.

  function Plot(placeholder, data_, options_, plugins) {
    // data is on the form:
    //   [ series1, series2 ... ]
    // where series is either just the data as [ [x1, y1], [x2, y2], ... ]
    // or { data: [ [x1, y1], [x2, y2], ... ], label: "some label", ... }

    var series = [],
      options = {
        // the color theme used for graphs
        colors: ["#edc240", "#afd8f8", "#cb4b4b", "#4da74d", "#9440ed"],
        legend: {
          show: true,
          noColumns: 1,
          // number of colums in legend table
          labelFormatter: null,
          // fn: string -> string
          labelBoxBorderColor: "#ccc",
          // border color for the little label boxes
          container: null,
          // container (as jQuery object) to put legend in, null means default on top of graph
          position: "ne",
          // position of default legend container within plot
          margin: 5,
          // distance from grid edge to default legend container within plot
          backgroundColor: null,
          // null means auto-detect
          backgroundOpacity: 0.85,
          // set to 0 to avoid background
          sorted: null // default to no legend sorting
        },

        xaxis: {
          show: null,
          // null = auto-detect, true = always, false = never
          position: "bottom",
          // or "top"
          mode: null,
          // null or "time"
          font: null,
          // null (derived from CSS in placeholder) or object like { size: 11, lineHeight: 13, style: "italic", weight: "bold", family: "sans-serif", variant: "small-caps" }
          color: null,
          // base color, labels, ticks
          tickColor: null,
          // possibly different color of ticks, e.g. "rgba(0,0,0,0.15)"
          transform: null,
          // null or f: number -> number to transform axis
          inverseTransform: null,
          // if transform is set, this should be the inverse function
          min: null,
          // min. value to show, null means set automatically
          max: null,
          // max. value to show, null means set automatically
          autoscaleMargin: null,
          // margin in % to add if auto-setting min/max
          ticks: null,
          // either [1, 3] or [[1, "a"], 3] or (fn: axis info -> ticks) or app. number of ticks for auto-ticks
          tickFormatter: null,
          // fn: number -> string
          labelWidth: null,
          // size of tick labels in pixels
          labelHeight: null,
          reserveSpace: null,
          // whether to reserve space even if axis isn't shown
          tickLength: null,
          // size in pixels of ticks, or "full" for whole line
          alignTicksWithAxis: null,
          // axis number or null for no sync
          tickDecimals: null,
          // no. of decimals, null means auto
          tickSize: null,
          // number or [number, "unit"]
          minTickSize: null // number or [number, "unit"]
        },

        yaxis: {
          autoscaleMargin: 0.02,
          position: "left" // or "right"
        },

        xaxes: [],
        yaxes: [],
        series: {
          points: {
            show: false,
            radius: 3,
            lineWidth: 2,
            // in pixels
            fill: true,
            fillColor: "#ffffff",
            symbol: "circle" // or callback
          },

          lines: {
            // we don't put in show: false so we can see
            // whether lines were actively disabled
            lineWidth: 2,
            // in pixels
            fill: false,
            fillColor: null,
            steps: false
            // Omit 'zero', so we can later default its value to
            // match that of the 'fill' option.
          },

          bars: {
            show: false,
            lineWidth: 2,
            // in pixels
            barWidth: 1,
            // in units of the x axis
            fill: true,
            fillColor: null,
            align: "left",
            // "left", "right", or "center"
            horizontal: false,
            zero: true
          },
          shadowSize: 3,
          highlightColor: null
        },
        grid: {
          show: true,
          aboveData: false,
          color: "#545454",
          // primary color used for outline and labels
          backgroundColor: null,
          // null for transparent, else color
          borderColor: null,
          // set if different from the grid color
          tickColor: null,
          // color for the ticks, e.g. "rgba(0,0,0,0.15)"
          margin: 0,
          // distance from the canvas edge to the grid
          labelMargin: 5,
          // in pixels
          axisMargin: 8,
          // in pixels
          borderWidth: 2,
          // in pixels
          minBorderMargin: null,
          // in pixels, null means taken from points radius
          markings: null,
          // array of ranges or fn: axes -> array of ranges
          markingsColor: "#f4f4f4",
          markingsLineWidth: 2,
          // interactive stuff
          clickable: false,
          hoverable: false,
          autoHighlight: true,
          // highlight in case mouse is near
          mouseActiveRadius: 10 // how far the mouse can be away to activate an item
        },

        interaction: {
          redrawOverlayInterval: 1000 / 60 // time between updates, -1 means in same flow
        },

        hooks: {}
      },
      surface = null,
      // the canvas for the plot itself
      overlay = null,
      // canvas for interactive stuff on top of plot
      eventHolder = null,
      // jQuery object that events should be bound to
      ctx = null,
      octx = null,
      xaxes = [],
      yaxes = [],
      plotOffset = {
        left: 0,
        right: 0,
        top: 0,
        bottom: 0
      },
      plotWidth = 0,
      plotHeight = 0,
      hooks = {
        processOptions: [],
        processRawData: [],
        processDatapoints: [],
        processOffset: [],
        drawBackground: [],
        drawSeries: [],
        draw: [],
        bindEvents: [],
        drawOverlay: [],
        shutdown: []
      },
      plot = this;

    // public functions
    plot.setData = setData;
    plot.setupGrid = setupGrid;
    plot.draw = draw;
    plot.getPlaceholder = function () {
      return placeholder;
    };
    plot.getCanvas = function () {
      return surface.element;
    };
    plot.getPlotOffset = function () {
      return plotOffset;
    };
    plot.width = function () {
      return plotWidth;
    };
    plot.height = function () {
      return plotHeight;
    };
    plot.offset = function () {
      var o = eventHolder.offset();
      o.left += plotOffset.left;
      o.top += plotOffset.top;
      return o;
    };
    plot.getData = function () {
      return series;
    };
    plot.getAxes = function () {
      var res = {},
        i;
      $.each(xaxes.concat(yaxes), function (_, axis) {
        if (axis) res[axis.direction + (axis.n != 1 ? axis.n : "") + "axis"] = axis;
      });
      return res;
    };
    plot.getXAxes = function () {
      return xaxes;
    };
    plot.getYAxes = function () {
      return yaxes;
    };
    plot.c2p = canvasToAxisCoords;
    plot.p2c = axisToCanvasCoords;
    plot.getOptions = function () {
      return options;
    };
    plot.highlight = highlight;
    plot.unhighlight = unhighlight;
    plot.triggerRedrawOverlay = triggerRedrawOverlay;
    plot.pointOffset = function (point) {
      return {
        left: parseInt(xaxes[axisNumber(point, "x") - 1].p2c(+point.x) + plotOffset.left, 10),
        top: parseInt(yaxes[axisNumber(point, "y") - 1].p2c(+point.y) + plotOffset.top, 10)
      };
    };
    plot.shutdown = shutdown;
    plot.destroy = function () {
      shutdown();
      placeholder.removeData("plot").empty();
      series = [];
      options = null;
      surface = null;
      overlay = null;
      eventHolder = null;
      ctx = null;
      octx = null;
      xaxes = [];
      yaxes = [];
      hooks = null;
      highlights = [];
      plot = null;
    };
    plot.resize = function () {
      var width = placeholder.width(),
        height = placeholder.height();
      surface.resize(width, height);
      overlay.resize(width, height);
    };

    // public attributes
    plot.hooks = hooks;

    // initialize
    initPlugins(plot);
    parseOptions(options_);
    setupCanvases();
    setData(data_);
    setupGrid();
    draw();
    bindEvents();
    function executeHooks(hook, args) {
      args = [plot].concat(args);
      for (var i = 0; i < hook.length; ++i) hook[i].apply(this, args);
    }
    function initPlugins() {
      // References to key classes, allowing plugins to modify them

      var classes = {
        Canvas: Canvas
      };
      for (var i = 0; i < plugins.length; ++i) {
        var p = plugins[i];
        p.init(plot, classes);
        if (p.options) $.extend(true, options, p.options);
      }
    }
    function parseOptions(opts) {
      $.extend(true, options, opts);

      // $.extend merges arrays, rather than replacing them.  When less
      // colors are provided than the size of the default palette, we
      // end up with those colors plus the remaining defaults, which is
      // not expected behavior; avoid it by replacing them here.

      if (opts && opts.colors) {
        options.colors = opts.colors;
      }
      if (options.xaxis.color == null) options.xaxis.color = $.color.parse(options.grid.color).scale('a', 0.22).toString();
      if (options.yaxis.color == null) options.yaxis.color = $.color.parse(options.grid.color).scale('a', 0.22).toString();
      if (options.xaxis.tickColor == null)
        // grid.tickColor for back-compatibility
        options.xaxis.tickColor = options.grid.tickColor || options.xaxis.color;
      if (options.yaxis.tickColor == null)
        // grid.tickColor for back-compatibility
        options.yaxis.tickColor = options.grid.tickColor || options.yaxis.color;
      if (options.grid.borderColor == null) options.grid.borderColor = options.grid.color;
      if (options.grid.tickColor == null) options.grid.tickColor = $.color.parse(options.grid.color).scale('a', 0.22).toString();

      // Fill in defaults for axis options, including any unspecified
      // font-spec fields, if a font-spec was provided.

      // If no x/y axis options were provided, create one of each anyway,
      // since the rest of the code assumes that they exist.

      var i,
        axisOptions,
        axisCount,
        fontSize = placeholder.css("font-size"),
        fontSizeDefault = fontSize ? +fontSize.replace("px", "") : 13,
        fontDefaults = {
          style: placeholder.css("font-style"),
          size: Math.round(0.8 * fontSizeDefault),
          variant: placeholder.css("font-variant"),
          weight: placeholder.css("font-weight"),
          family: placeholder.css("font-family")
        };
      axisCount = options.xaxes.length || 1;
      for (i = 0; i < axisCount; ++i) {
        axisOptions = options.xaxes[i];
        if (axisOptions && !axisOptions.tickColor) {
          axisOptions.tickColor = axisOptions.color;
        }
        axisOptions = $.extend(true, {}, options.xaxis, axisOptions);
        options.xaxes[i] = axisOptions;
        if (axisOptions.font) {
          axisOptions.font = $.extend({}, fontDefaults, axisOptions.font);
          if (!axisOptions.font.color) {
            axisOptions.font.color = axisOptions.color;
          }
          if (!axisOptions.font.lineHeight) {
            axisOptions.font.lineHeight = Math.round(axisOptions.font.size * 1.15);
          }
        }
      }
      axisCount = options.yaxes.length || 1;
      for (i = 0; i < axisCount; ++i) {
        axisOptions = options.yaxes[i];
        if (axisOptions && !axisOptions.tickColor) {
          axisOptions.tickColor = axisOptions.color;
        }
        axisOptions = $.extend(true, {}, options.yaxis, axisOptions);
        options.yaxes[i] = axisOptions;
        if (axisOptions.font) {
          axisOptions.font = $.extend({}, fontDefaults, axisOptions.font);
          if (!axisOptions.font.color) {
            axisOptions.font.color = axisOptions.color;
          }
          if (!axisOptions.font.lineHeight) {
            axisOptions.font.lineHeight = Math.round(axisOptions.font.size * 1.15);
          }
        }
      }

      // backwards compatibility, to be removed in future
      if (options.xaxis.noTicks && options.xaxis.ticks == null) options.xaxis.ticks = options.xaxis.noTicks;
      if (options.yaxis.noTicks && options.yaxis.ticks == null) options.yaxis.ticks = options.yaxis.noTicks;
      if (options.x2axis) {
        options.xaxes[1] = $.extend(true, {}, options.xaxis, options.x2axis);
        options.xaxes[1].position = "top";
        // Override the inherit to allow the axis to auto-scale
        if (options.x2axis.min == null) {
          options.xaxes[1].min = null;
        }
        if (options.x2axis.max == null) {
          options.xaxes[1].max = null;
        }
      }
      if (options.y2axis) {
        options.yaxes[1] = $.extend(true, {}, options.yaxis, options.y2axis);
        options.yaxes[1].position = "right";
        // Override the inherit to allow the axis to auto-scale
        if (options.y2axis.min == null) {
          options.yaxes[1].min = null;
        }
        if (options.y2axis.max == null) {
          options.yaxes[1].max = null;
        }
      }
      if (options.grid.coloredAreas) options.grid.markings = options.grid.coloredAreas;
      if (options.grid.coloredAreasColor) options.grid.markingsColor = options.grid.coloredAreasColor;
      if (options.lines) $.extend(true, options.series.lines, options.lines);
      if (options.points) $.extend(true, options.series.points, options.points);
      if (options.bars) $.extend(true, options.series.bars, options.bars);
      if (options.shadowSize != null) options.series.shadowSize = options.shadowSize;
      if (options.highlightColor != null) options.series.highlightColor = options.highlightColor;

      // save options on axes for future reference
      for (i = 0; i < options.xaxes.length; ++i) getOrCreateAxis(xaxes, i + 1).options = options.xaxes[i];
      for (i = 0; i < options.yaxes.length; ++i) getOrCreateAxis(yaxes, i + 1).options = options.yaxes[i];

      // add hooks from options
      for (var n in hooks) if (options.hooks[n] && options.hooks[n].length) hooks[n] = hooks[n].concat(options.hooks[n]);
      executeHooks(hooks.processOptions, [options]);
    }
    function setData(d) {
      series = parseData(d);
      fillInSeriesOptions();
      processData();
    }
    function parseData(d) {
      var res = [];
      for (var i = 0; i < d.length; ++i) {
        var s = $.extend(true, {}, options.series);
        if (d[i].data != null) {
          s.data = d[i].data; // move the data instead of deep-copy
          delete d[i].data;
          $.extend(true, s, d[i]);
          d[i].data = s.data;
        } else s.data = d[i];
        res.push(s);
      }
      return res;
    }
    function axisNumber(obj, coord) {
      var a = obj[coord + "axis"];
      if (_typeof(a) == "object")
        // if we got a real axis, extract number
        a = a.n;
      if (typeof a != "number") a = 1; // default to first axis
      return a;
    }
    function allAxes() {
      // return flat array without annoying null entries
      return $.grep(xaxes.concat(yaxes), function (a) {
        return a;
      });
    }
    function canvasToAxisCoords(pos) {
      // return an object with x/y corresponding to all used axes
      var res = {},
        i,
        axis;
      for (i = 0; i < xaxes.length; ++i) {
        axis = xaxes[i];
        if (axis && axis.used) res["x" + axis.n] = axis.c2p(pos.left);
      }
      for (i = 0; i < yaxes.length; ++i) {
        axis = yaxes[i];
        if (axis && axis.used) res["y" + axis.n] = axis.c2p(pos.top);
      }
      if (res.x1 !== undefined) res.x = res.x1;
      if (res.y1 !== undefined) res.y = res.y1;
      return res;
    }
    function axisToCanvasCoords(pos) {
      // get canvas coords from the first pair of x/y found in pos
      var res = {},
        i,
        axis,
        key;
      for (i = 0; i < xaxes.length; ++i) {
        axis = xaxes[i];
        if (axis && axis.used) {
          key = "x" + axis.n;
          if (pos[key] == null && axis.n == 1) key = "x";
          if (pos[key] != null) {
            res.left = axis.p2c(pos[key]);
            break;
          }
        }
      }
      for (i = 0; i < yaxes.length; ++i) {
        axis = yaxes[i];
        if (axis && axis.used) {
          key = "y" + axis.n;
          if (pos[key] == null && axis.n == 1) key = "y";
          if (pos[key] != null) {
            res.top = axis.p2c(pos[key]);
            break;
          }
        }
      }
      return res;
    }
    function getOrCreateAxis(axes, number) {
      if (!axes[number - 1]) axes[number - 1] = {
        n: number,
        // save the number for future reference
        direction: axes == xaxes ? "x" : "y",
        options: $.extend(true, {}, axes == xaxes ? options.xaxis : options.yaxis)
      };
      return axes[number - 1];
    }
    function fillInSeriesOptions() {
      var neededColors = series.length,
        maxIndex = -1,
        i;

      // Subtract the number of series that already have fixed colors or
      // color indexes from the number that we still need to generate.

      for (i = 0; i < series.length; ++i) {
        var sc = series[i].color;
        if (sc != null) {
          neededColors--;
          if (typeof sc == "number" && sc > maxIndex) {
            maxIndex = sc;
          }
        }
      }

      // If any of the series have fixed color indexes, then we need to
      // generate at least as many colors as the highest index.

      if (neededColors <= maxIndex) {
        neededColors = maxIndex + 1;
      }

      // Generate all the colors, using first the option colors and then
      // variations on those colors once they're exhausted.

      var c,
        colors = [],
        colorPool = options.colors,
        colorPoolSize = colorPool.length,
        variation = 0;
      for (i = 0; i < neededColors; i++) {
        c = $.color.parse(colorPool[i % colorPoolSize] || "#666");

        // Each time we exhaust the colors in the pool we adjust
        // a scaling factor used to produce more variations on
        // those colors. The factor alternates negative/positive
        // to produce lighter/darker colors.

        // Reset the variation after every few cycles, or else
        // it will end up producing only white or black colors.

        if (i % colorPoolSize == 0 && i) {
          if (variation >= 0) {
            if (variation < 0.5) {
              variation = -variation - 0.2;
            } else variation = 0;
          } else variation = -variation;
        }
        colors[i] = c.scale('rgb', 1 + variation);
      }

      // Finalize the series options, filling in their colors

      var colori = 0,
        s;
      for (i = 0; i < series.length; ++i) {
        s = series[i];

        // assign colors
        if (s.color == null) {
          s.color = colors[colori].toString();
          ++colori;
        } else if (typeof s.color == "number") s.color = colors[s.color].toString();

        // turn on lines automatically in case nothing is set
        if (s.lines.show == null) {
          var v,
            show = true;
          for (v in s) if (s[v] && s[v].show) {
            show = false;
            break;
          }
          if (show) s.lines.show = true;
        }

        // If nothing was provided for lines.zero, default it to match
        // lines.fill, since areas by default should extend to zero.

        if (s.lines.zero == null) {
          s.lines.zero = !!s.lines.fill;
        }

        // setup axes
        s.xaxis = getOrCreateAxis(xaxes, axisNumber(s, "x"));
        s.yaxis = getOrCreateAxis(yaxes, axisNumber(s, "y"));
      }
    }
    function processData() {
      var topSentry = Number.POSITIVE_INFINITY,
        bottomSentry = Number.NEGATIVE_INFINITY,
        fakeInfinity = Number.MAX_VALUE,
        i,
        j,
        k,
        m,
        length,
        s,
        points,
        ps,
        x,
        y,
        axis,
        val,
        f,
        p,
        data,
        format;
      function updateAxis(axis, min, max) {
        if (min < axis.datamin && min != -fakeInfinity) axis.datamin = min;
        if (max > axis.datamax && max != fakeInfinity) axis.datamax = max;
      }
      $.each(allAxes(), function (_, axis) {
        // init axis
        axis.datamin = topSentry;
        axis.datamax = bottomSentry;
        axis.used = false;
      });
      for (i = 0; i < series.length; ++i) {
        s = series[i];
        s.datapoints = {
          points: []
        };
        executeHooks(hooks.processRawData, [s, s.data, s.datapoints]);
      }

      // first pass: clean and copy data
      for (i = 0; i < series.length; ++i) {
        s = series[i];
        data = s.data;
        format = s.datapoints.format;
        if (!format) {
          format = [];
          // find out how to copy
          format.push({
            x: true,
            number: true,
            required: true
          });
          format.push({
            y: true,
            number: true,
            required: true
          });
          if (s.bars.show || s.lines.show && s.lines.fill) {
            var autoscale = !!(s.bars.show && s.bars.zero || s.lines.show && s.lines.zero);
            format.push({
              y: true,
              number: true,
              required: false,
              defaultValue: 0,
              autoscale: autoscale
            });
            if (s.bars.horizontal) {
              delete format[format.length - 1].y;
              format[format.length - 1].x = true;
            }
          }
          s.datapoints.format = format;
        }
        if (s.datapoints.pointsize != null) continue; // already filled in

        s.datapoints.pointsize = format.length;
        ps = s.datapoints.pointsize;
        points = s.datapoints.points;
        var insertSteps = s.lines.show && s.lines.steps;
        s.xaxis.used = s.yaxis.used = true;
        for (j = k = 0; j < data.length; ++j, k += ps) {
          p = data[j];
          var nullify = p == null;
          if (!nullify) {
            for (m = 0; m < ps; ++m) {
              val = p[m];
              f = format[m];
              if (f) {
                if (f.number && val != null) {
                  val = +val; // convert to number
                  if (isNaN(val)) val = null;else if (val == Infinity) val = fakeInfinity;else if (val == -Infinity) val = -fakeInfinity;
                }
                if (val == null) {
                  if (f.required) nullify = true;
                  if (f.defaultValue != null) val = f.defaultValue;
                }
              }
              points[k + m] = val;
            }
          }
          if (nullify) {
            for (m = 0; m < ps; ++m) {
              val = points[k + m];
              if (val != null) {
                f = format[m];
                // extract min/max info
                if (f.autoscale !== false) {
                  if (f.x) {
                    updateAxis(s.xaxis, val, val);
                  }
                  if (f.y) {
                    updateAxis(s.yaxis, val, val);
                  }
                }
              }
              points[k + m] = null;
            }
          } else {
            // a little bit of line specific stuff that
            // perhaps shouldn't be here, but lacking
            // better means...
            if (insertSteps && k > 0 && points[k - ps] != null && points[k - ps] != points[k] && points[k - ps + 1] != points[k + 1]) {
              // copy the point to make room for a middle point
              for (m = 0; m < ps; ++m) points[k + ps + m] = points[k + m];

              // middle point has same y
              points[k + 1] = points[k - ps + 1];

              // we've added a point, better reflect that
              k += ps;
            }
          }
        }
      }

      // give the hooks a chance to run
      for (i = 0; i < series.length; ++i) {
        s = series[i];
        executeHooks(hooks.processDatapoints, [s, s.datapoints]);
      }

      // second pass: find datamax/datamin for auto-scaling
      for (i = 0; i < series.length; ++i) {
        s = series[i];
        points = s.datapoints.points;
        ps = s.datapoints.pointsize;
        format = s.datapoints.format;
        var xmin = topSentry,
          ymin = topSentry,
          xmax = bottomSentry,
          ymax = bottomSentry;
        for (j = 0; j < points.length; j += ps) {
          if (points[j] == null) continue;
          for (m = 0; m < ps; ++m) {
            val = points[j + m];
            f = format[m];
            if (!f || f.autoscale === false || val == fakeInfinity || val == -fakeInfinity) continue;
            if (f.x) {
              if (val < xmin) xmin = val;
              if (val > xmax) xmax = val;
            }
            if (f.y) {
              if (val < ymin) ymin = val;
              if (val > ymax) ymax = val;
            }
          }
        }
        if (s.bars.show) {
          // make sure we got room for the bar on the dancing floor
          var delta;
          switch (s.bars.align) {
            case "left":
              delta = 0;
              break;
            case "right":
              delta = -s.bars.barWidth;
              break;
            default:
              delta = -s.bars.barWidth / 2;
          }
          if (s.bars.horizontal) {
            ymin += delta;
            ymax += delta + s.bars.barWidth;
          } else {
            xmin += delta;
            xmax += delta + s.bars.barWidth;
          }
        }
        updateAxis(s.xaxis, xmin, xmax);
        updateAxis(s.yaxis, ymin, ymax);
      }
      $.each(allAxes(), function (_, axis) {
        if (axis.datamin == topSentry) axis.datamin = null;
        if (axis.datamax == bottomSentry) axis.datamax = null;
      });
    }
    function setupCanvases() {
      // Make sure the placeholder is clear of everything except canvases
      // from a previous plot in this container that we'll try to re-use.

      placeholder.css("padding", 0) // padding messes up the positioning
      .children().filter(function () {
        return !$(this).hasClass("flot-overlay") && !$(this).hasClass('flot-base');
      }).remove();
      if (placeholder.css("position") == 'static') placeholder.css("position", "relative"); // for positioning labels and overlay

      surface = new Canvas("flot-base", placeholder);
      overlay = new Canvas("flot-overlay", placeholder); // overlay canvas for interactive features

      ctx = surface.context;
      octx = overlay.context;

      // define which element we're listening for events on
      eventHolder = $(overlay.element).unbind();

      // If we're re-using a plot object, shut down the old one

      var existing = placeholder.data("plot");
      if (existing) {
        existing.shutdown();
        overlay.clear();
      }

      // save in case we get replotted
      placeholder.data("plot", plot);
    }
    function bindEvents() {
      // bind events
      if (options.grid.hoverable) {
        eventHolder.mousemove(onMouseMove);

        // Use bind, rather than .mouseleave, because we officially
        // still support jQuery 1.2.6, which doesn't define a shortcut
        // for mouseenter or mouseleave.  This was a bug/oversight that
        // was fixed somewhere around 1.3.x.  We can return to using
        // .mouseleave when we drop support for 1.2.6.

        eventHolder.bind("mouseleave", onMouseLeave);
      }
      if (options.grid.clickable) eventHolder.click(onClick);
      executeHooks(hooks.bindEvents, [eventHolder]);
    }
    function shutdown() {
      if (redrawTimeout) clearTimeout(redrawTimeout);
      eventHolder.unbind("mousemove", onMouseMove);
      eventHolder.unbind("mouseleave", onMouseLeave);
      eventHolder.unbind("click", onClick);
      executeHooks(hooks.shutdown, [eventHolder]);
    }
    function setTransformationHelpers(axis) {
      // set helper functions on the axis, assumes plot area
      // has been computed already

      function identity(x) {
        return x;
      }
      var s,
        m,
        t = axis.options.transform || identity,
        it = axis.options.inverseTransform;

      // precompute how much the axis is scaling a point
      // in canvas space
      if (axis.direction == "x") {
        s = axis.scale = plotWidth / Math.abs(t(axis.max) - t(axis.min));
        m = Math.min(t(axis.max), t(axis.min));
      } else {
        s = axis.scale = plotHeight / Math.abs(t(axis.max) - t(axis.min));
        s = -s;
        m = Math.max(t(axis.max), t(axis.min));
      }

      // data point to canvas coordinate
      if (t == identity)
        // slight optimization
        axis.p2c = function (p) {
          return (p - m) * s;
        };else axis.p2c = function (p) {
        return (t(p) - m) * s;
      };
      // canvas coordinate to data point
      if (!it) axis.c2p = function (c) {
        return m + c / s;
      };else axis.c2p = function (c) {
        return it(m + c / s);
      };
    }
    function measureTickLabels(axis) {
      var opts = axis.options,
        ticks = axis.ticks || [],
        labelWidth = opts.labelWidth || 0,
        labelHeight = opts.labelHeight || 0,
        maxWidth = labelWidth || (axis.direction == "x" ? Math.floor(surface.width / (ticks.length || 1)) : null),
        legacyStyles = axis.direction + "Axis " + axis.direction + axis.n + "Axis",
        layer = "flot-" + axis.direction + "-axis flot-" + axis.direction + axis.n + "-axis " + legacyStyles,
        font = opts.font || "flot-tick-label tickLabel";
      for (var i = 0; i < ticks.length; ++i) {
        var t = ticks[i];
        if (!t.label) continue;
        var info = surface.getTextInfo(layer, t.label, font, null, maxWidth);
        labelWidth = Math.max(labelWidth, info.width);
        labelHeight = Math.max(labelHeight, info.height);
      }
      axis.labelWidth = opts.labelWidth || labelWidth;
      axis.labelHeight = opts.labelHeight || labelHeight;
    }
    function allocateAxisBoxFirstPhase(axis) {
      // find the bounding box of the axis by looking at label
      // widths/heights and ticks, make room by diminishing the
      // plotOffset; this first phase only looks at one
      // dimension per axis, the other dimension depends on the
      // other axes so will have to wait

      var lw = axis.labelWidth,
        lh = axis.labelHeight,
        pos = axis.options.position,
        isXAxis = axis.direction === "x",
        tickLength = axis.options.tickLength,
        axisMargin = options.grid.axisMargin,
        padding = options.grid.labelMargin,
        innermost = true,
        outermost = true,
        first = true,
        found = false;

      // Determine the axis's position in its direction and on its side

      $.each(isXAxis ? xaxes : yaxes, function (i, a) {
        if (a && (a.show || a.reserveSpace)) {
          if (a === axis) {
            found = true;
          } else if (a.options.position === pos) {
            if (found) {
              outermost = false;
            } else {
              innermost = false;
            }
          }
          if (!found) {
            first = false;
          }
        }
      });

      // The outermost axis on each side has no margin

      if (outermost) {
        axisMargin = 0;
      }

      // The ticks for the first axis in each direction stretch across

      if (tickLength == null) {
        tickLength = first ? "full" : 5;
      }
      if (!isNaN(+tickLength)) padding += +tickLength;
      if (isXAxis) {
        lh += padding;
        if (pos == "bottom") {
          plotOffset.bottom += lh + axisMargin;
          axis.box = {
            top: surface.height - plotOffset.bottom,
            height: lh
          };
        } else {
          axis.box = {
            top: plotOffset.top + axisMargin,
            height: lh
          };
          plotOffset.top += lh + axisMargin;
        }
      } else {
        lw += padding;
        if (pos == "left") {
          axis.box = {
            left: plotOffset.left + axisMargin,
            width: lw
          };
          plotOffset.left += lw + axisMargin;
        } else {
          plotOffset.right += lw + axisMargin;
          axis.box = {
            left: surface.width - plotOffset.right,
            width: lw
          };
        }
      }

      // save for future reference
      axis.position = pos;
      axis.tickLength = tickLength;
      axis.box.padding = padding;
      axis.innermost = innermost;
    }
    function allocateAxisBoxSecondPhase(axis) {
      // now that all axis boxes have been placed in one
      // dimension, we can set the remaining dimension coordinates
      if (axis.direction == "x") {
        axis.box.left = plotOffset.left - axis.labelWidth / 2;
        axis.box.width = surface.width - plotOffset.left - plotOffset.right + axis.labelWidth;
      } else {
        axis.box.top = plotOffset.top - axis.labelHeight / 2;
        axis.box.height = surface.height - plotOffset.bottom - plotOffset.top + axis.labelHeight;
      }
    }
    function adjustLayoutForThingsStickingOut() {
      // possibly adjust plot offset to ensure everything stays
      // inside the canvas and isn't clipped off

      var minMargin = options.grid.minBorderMargin,
        axis,
        i;

      // check stuff from the plot (FIXME: this should just read
      // a value from the series, otherwise it's impossible to
      // customize)
      if (minMargin == null) {
        minMargin = 0;
        for (i = 0; i < series.length; ++i) minMargin = Math.max(minMargin, 2 * (series[i].points.radius + series[i].points.lineWidth / 2));
      }
      var margins = {
        left: minMargin,
        right: minMargin,
        top: minMargin,
        bottom: minMargin
      };

      // check axis labels, note we don't check the actual
      // labels but instead use the overall width/height to not
      // jump as much around with replots
      $.each(allAxes(), function (_, axis) {
        if (axis.reserveSpace && axis.ticks && axis.ticks.length) {
          if (axis.direction === "x") {
            margins.left = Math.max(margins.left, axis.labelWidth / 2);
            margins.right = Math.max(margins.right, axis.labelWidth / 2);
          } else {
            margins.bottom = Math.max(margins.bottom, axis.labelHeight / 2);
            margins.top = Math.max(margins.top, axis.labelHeight / 2);
          }
        }
      });
      plotOffset.left = Math.ceil(Math.max(margins.left, plotOffset.left));
      plotOffset.right = Math.ceil(Math.max(margins.right, plotOffset.right));
      plotOffset.top = Math.ceil(Math.max(margins.top, plotOffset.top));
      plotOffset.bottom = Math.ceil(Math.max(margins.bottom, plotOffset.bottom));
    }
    function setupGrid() {
      var i,
        axes = allAxes(),
        showGrid = options.grid.show;

      // Initialize the plot's offset from the edge of the canvas

      for (var a in plotOffset) {
        var margin = options.grid.margin || 0;
        plotOffset[a] = typeof margin == "number" ? margin : margin[a] || 0;
      }
      executeHooks(hooks.processOffset, [plotOffset]);

      // If the grid is visible, add its border width to the offset

      for (var a in plotOffset) {
        if (_typeof(options.grid.borderWidth) == "object") {
          plotOffset[a] += showGrid ? options.grid.borderWidth[a] : 0;
        } else {
          plotOffset[a] += showGrid ? options.grid.borderWidth : 0;
        }
      }
      $.each(axes, function (_, axis) {
        var axisOpts = axis.options;
        axis.show = axisOpts.show == null ? axis.used : axisOpts.show;
        axis.reserveSpace = axisOpts.reserveSpace == null ? axis.show : axisOpts.reserveSpace;
        setRange(axis);
      });
      if (showGrid) {
        var allocatedAxes = $.grep(axes, function (axis) {
          return axis.show || axis.reserveSpace;
        });
        $.each(allocatedAxes, function (_, axis) {
          // make the ticks
          setupTickGeneration(axis);
          setTicks(axis);
          snapRangeToTicks(axis, axis.ticks);
          // find labelWidth/Height for axis
          measureTickLabels(axis);
        });

        // with all dimensions calculated, we can compute the
        // axis bounding boxes, start from the outside
        // (reverse order)
        for (i = allocatedAxes.length - 1; i >= 0; --i) allocateAxisBoxFirstPhase(allocatedAxes[i]);

        // make sure we've got enough space for things that
        // might stick out
        adjustLayoutForThingsStickingOut();
        $.each(allocatedAxes, function (_, axis) {
          allocateAxisBoxSecondPhase(axis);
        });
      }
      plotWidth = surface.width - plotOffset.left - plotOffset.right;
      plotHeight = surface.height - plotOffset.bottom - plotOffset.top;

      // now we got the proper plot dimensions, we can compute the scaling
      $.each(axes, function (_, axis) {
        setTransformationHelpers(axis);
      });
      if (showGrid) {
        drawAxisLabels();
      }
      insertLegend();
    }
    function setRange(axis) {
      var opts = axis.options,
        min = +(opts.min != null ? opts.min : axis.datamin),
        max = +(opts.max != null ? opts.max : axis.datamax),
        delta = max - min;
      if (delta == 0.0) {
        // degenerate case
        var widen = max == 0 ? 1 : 0.01;
        if (opts.min == null) min -= widen;
        // always widen max if we couldn't widen min to ensure we
        // don't fall into min == max which doesn't work
        if (opts.max == null || opts.min != null) max += widen;
      } else {
        // consider autoscaling
        var margin = opts.autoscaleMargin;
        if (margin != null) {
          if (opts.min == null) {
            min -= delta * margin;
            // make sure we don't go below zero if all values
            // are positive
            if (min < 0 && axis.datamin != null && axis.datamin >= 0) min = 0;
          }
          if (opts.max == null) {
            max += delta * margin;
            if (max > 0 && axis.datamax != null && axis.datamax <= 0) max = 0;
          }
        }
      }
      axis.min = min;
      axis.max = max;
    }
    function setupTickGeneration(axis) {
      var opts = axis.options;

      // estimate number of ticks
      var noTicks;
      if (typeof opts.ticks == "number" && opts.ticks > 0) noTicks = opts.ticks;else
        // heuristic based on the model a*sqrt(x) fitted to
        // some data points that seemed reasonable
        noTicks = 0.3 * Math.sqrt(axis.direction == "x" ? surface.width : surface.height);
      var delta = (axis.max - axis.min) / noTicks,
        dec = -Math.floor(Math.log(delta) / Math.LN10),
        maxDec = opts.tickDecimals;
      if (maxDec != null && dec > maxDec) {
        dec = maxDec;
      }
      var magn = Math.pow(10, -dec),
        norm = delta / magn,
        // norm is between 1.0 and 10.0
        size;
      if (norm < 1.5) {
        size = 1;
      } else if (norm < 3) {
        size = 2;
        // special case for 2.5, requires an extra decimal
        if (norm > 2.25 && (maxDec == null || dec + 1 <= maxDec)) {
          size = 2.5;
          ++dec;
        }
      } else if (norm < 7.5) {
        size = 5;
      } else {
        size = 10;
      }
      size *= magn;
      if (opts.minTickSize != null && size < opts.minTickSize) {
        size = opts.minTickSize;
      }
      axis.delta = delta;
      axis.tickDecimals = Math.max(0, maxDec != null ? maxDec : dec);
      axis.tickSize = opts.tickSize || size;

      // Time mode was moved to a plug-in in 0.8, and since so many people use it
      // we'll add an especially friendly reminder to make sure they included it.

      if (opts.mode == "time" && !axis.tickGenerator) {
        throw new Error("Time mode requires the flot.time plugin.");
      }

      // Flot supports base-10 axes; any other mode else is handled by a plug-in,
      // like flot.time.js.

      if (!axis.tickGenerator) {
        axis.tickGenerator = function (axis) {
          var ticks = [],
            start = floorInBase(axis.min, axis.tickSize),
            i = 0,
            v = Number.NaN,
            prev;
          do {
            prev = v;
            v = start + i * axis.tickSize;
            ticks.push(v);
            ++i;
          } while (v < axis.max && v != prev);
          return ticks;
        };
        axis.tickFormatter = function (value, axis) {
          var factor = axis.tickDecimals ? Math.pow(10, axis.tickDecimals) : 1;
          var formatted = "" + Math.round(value * factor) / factor;

          // If tickDecimals was specified, ensure that we have exactly that
          // much precision; otherwise default to the value's own precision.

          if (axis.tickDecimals != null) {
            var decimal = formatted.indexOf(".");
            var precision = decimal == -1 ? 0 : formatted.length - decimal - 1;
            if (precision < axis.tickDecimals) {
              return (precision ? formatted : formatted + ".") + ("" + factor).substr(1, axis.tickDecimals - precision);
            }
          }
          return formatted;
        };
      }
      if ($.isFunction(opts.tickFormatter)) axis.tickFormatter = function (v, axis) {
        return "" + opts.tickFormatter(v, axis);
      };
      if (opts.alignTicksWithAxis != null) {
        var otherAxis = (axis.direction == "x" ? xaxes : yaxes)[opts.alignTicksWithAxis - 1];
        if (otherAxis && otherAxis.used && otherAxis != axis) {
          // consider snapping min/max to outermost nice ticks
          var niceTicks = axis.tickGenerator(axis);
          if (niceTicks.length > 0) {
            if (opts.min == null) axis.min = Math.min(axis.min, niceTicks[0]);
            if (opts.max == null && niceTicks.length > 1) axis.max = Math.max(axis.max, niceTicks[niceTicks.length - 1]);
          }
          axis.tickGenerator = function (axis) {
            // copy ticks, scaled to this axis
            var ticks = [],
              v,
              i;
            for (i = 0; i < otherAxis.ticks.length; ++i) {
              v = (otherAxis.ticks[i].v - otherAxis.min) / (otherAxis.max - otherAxis.min);
              v = axis.min + v * (axis.max - axis.min);
              ticks.push(v);
            }
            return ticks;
          };

          // we might need an extra decimal since forced
          // ticks don't necessarily fit naturally
          if (!axis.mode && opts.tickDecimals == null) {
            var extraDec = Math.max(0, -Math.floor(Math.log(axis.delta) / Math.LN10) + 1),
              ts = axis.tickGenerator(axis);

            // only proceed if the tick interval rounded
            // with an extra decimal doesn't give us a
            // zero at end
            if (!(ts.length > 1 && /\..*0$/.test((ts[1] - ts[0]).toFixed(extraDec)))) axis.tickDecimals = extraDec;
          }
        }
      }
    }
    function setTicks(axis) {
      var oticks = axis.options.ticks,
        ticks = [];
      if (oticks == null || typeof oticks == "number" && oticks > 0) ticks = axis.tickGenerator(axis);else if (oticks) {
        if ($.isFunction(oticks))
          // generate the ticks
          ticks = oticks(axis);else ticks = oticks;
      }

      // clean up/labelify the supplied ticks, copy them over
      var i, v;
      axis.ticks = [];
      for (i = 0; i < ticks.length; ++i) {
        var label = null;
        var t = ticks[i];
        if (_typeof(t) == "object") {
          v = +t[0];
          if (t.length > 1) label = t[1];
        } else v = +t;
        if (label == null) label = axis.tickFormatter(v, axis);
        if (!isNaN(v)) axis.ticks.push({
          v: v,
          label: label
        });
      }
    }
    function snapRangeToTicks(axis, ticks) {
      if (axis.options.autoscaleMargin && ticks.length > 0) {
        // snap to ticks
        if (axis.options.min == null) axis.min = Math.min(axis.min, ticks[0].v);
        if (axis.options.max == null && ticks.length > 1) axis.max = Math.max(axis.max, ticks[ticks.length - 1].v);
      }
    }
    function draw() {
      surface.clear();
      executeHooks(hooks.drawBackground, [ctx]);
      var grid = options.grid;

      // draw background, if any
      if (grid.show && grid.backgroundColor) drawBackground();
      if (grid.show && !grid.aboveData) {
        drawGrid();
      }
      for (var i = 0; i < series.length; ++i) {
        executeHooks(hooks.drawSeries, [ctx, series[i]]);
        drawSeries(series[i]);
      }
      executeHooks(hooks.draw, [ctx]);
      if (grid.show && grid.aboveData) {
        drawGrid();
      }
      surface.render();

      // A draw implies that either the axes or data have changed, so we
      // should probably update the overlay highlights as well.

      triggerRedrawOverlay();
    }
    function extractRange(ranges, coord) {
      var axis,
        from,
        to,
        key,
        axes = allAxes();
      for (var i = 0; i < axes.length; ++i) {
        axis = axes[i];
        if (axis.direction == coord) {
          key = coord + axis.n + "axis";
          if (!ranges[key] && axis.n == 1) key = coord + "axis"; // support x1axis as xaxis
          if (ranges[key]) {
            from = ranges[key].from;
            to = ranges[key].to;
            break;
          }
        }
      }

      // backwards-compat stuff - to be removed in future
      if (!ranges[key]) {
        axis = coord == "x" ? xaxes[0] : yaxes[0];
        from = ranges[coord + "1"];
        to = ranges[coord + "2"];
      }

      // auto-reverse as an added bonus
      if (from != null && to != null && from > to) {
        var tmp = from;
        from = to;
        to = tmp;
      }
      return {
        from: from,
        to: to,
        axis: axis
      };
    }
    function drawBackground() {
      ctx.save();
      ctx.translate(plotOffset.left, plotOffset.top);
      ctx.fillStyle = getColorOrGradient(options.grid.backgroundColor, plotHeight, 0, "rgba(255, 255, 255, 0)");
      ctx.fillRect(0, 0, plotWidth, plotHeight);
      ctx.restore();
    }
    function drawGrid() {
      var i, axes, bw, bc;
      ctx.save();
      ctx.translate(plotOffset.left, plotOffset.top);

      // draw markings
      var markings = options.grid.markings;
      if (markings) {
        if ($.isFunction(markings)) {
          axes = plot.getAxes();
          // xmin etc. is backwards compatibility, to be
          // removed in the future
          axes.xmin = axes.xaxis.min;
          axes.xmax = axes.xaxis.max;
          axes.ymin = axes.yaxis.min;
          axes.ymax = axes.yaxis.max;
          markings = markings(axes);
        }
        for (i = 0; i < markings.length; ++i) {
          var m = markings[i],
            xrange = extractRange(m, "x"),
            yrange = extractRange(m, "y");

          // fill in missing
          if (xrange.from == null) xrange.from = xrange.axis.min;
          if (xrange.to == null) xrange.to = xrange.axis.max;
          if (yrange.from == null) yrange.from = yrange.axis.min;
          if (yrange.to == null) yrange.to = yrange.axis.max;

          // clip
          if (xrange.to < xrange.axis.min || xrange.from > xrange.axis.max || yrange.to < yrange.axis.min || yrange.from > yrange.axis.max) continue;
          xrange.from = Math.max(xrange.from, xrange.axis.min);
          xrange.to = Math.min(xrange.to, xrange.axis.max);
          yrange.from = Math.max(yrange.from, yrange.axis.min);
          yrange.to = Math.min(yrange.to, yrange.axis.max);
          var xequal = xrange.from === xrange.to,
            yequal = yrange.from === yrange.to;
          if (xequal && yequal) {
            continue;
          }

          // then draw
          xrange.from = Math.floor(xrange.axis.p2c(xrange.from));
          xrange.to = Math.floor(xrange.axis.p2c(xrange.to));
          yrange.from = Math.floor(yrange.axis.p2c(yrange.from));
          yrange.to = Math.floor(yrange.axis.p2c(yrange.to));
          if (xequal || yequal) {
            var lineWidth = m.lineWidth || options.grid.markingsLineWidth,
              subPixel = lineWidth % 2 ? 0.5 : 0;
            ctx.beginPath();
            ctx.strokeStyle = m.color || options.grid.markingsColor;
            ctx.lineWidth = lineWidth;
            if (xequal) {
              ctx.moveTo(xrange.to + subPixel, yrange.from);
              ctx.lineTo(xrange.to + subPixel, yrange.to);
            } else {
              ctx.moveTo(xrange.from, yrange.to + subPixel);
              ctx.lineTo(xrange.to, yrange.to + subPixel);
            }
            ctx.stroke();
          } else {
            ctx.fillStyle = m.color || options.grid.markingsColor;
            ctx.fillRect(xrange.from, yrange.to, xrange.to - xrange.from, yrange.from - yrange.to);
          }
        }
      }

      // draw the ticks
      axes = allAxes();
      bw = options.grid.borderWidth;
      for (var j = 0; j < axes.length; ++j) {
        var axis = axes[j],
          box = axis.box,
          t = axis.tickLength,
          x,
          y,
          xoff,
          yoff;
        if (!axis.show || axis.ticks.length == 0) continue;
        ctx.lineWidth = 1;

        // find the edges
        if (axis.direction == "x") {
          x = 0;
          if (t == "full") y = axis.position == "top" ? 0 : plotHeight;else y = box.top - plotOffset.top + (axis.position == "top" ? box.height : 0);
        } else {
          y = 0;
          if (t == "full") x = axis.position == "left" ? 0 : plotWidth;else x = box.left - plotOffset.left + (axis.position == "left" ? box.width : 0);
        }

        // draw tick bar
        if (!axis.innermost) {
          ctx.strokeStyle = axis.options.color;
          ctx.beginPath();
          xoff = yoff = 0;
          if (axis.direction == "x") xoff = plotWidth + 1;else yoff = plotHeight + 1;
          if (ctx.lineWidth == 1) {
            if (axis.direction == "x") {
              y = Math.floor(y) + 0.5;
            } else {
              x = Math.floor(x) + 0.5;
            }
          }
          ctx.moveTo(x, y);
          ctx.lineTo(x + xoff, y + yoff);
          ctx.stroke();
        }

        // draw ticks

        ctx.strokeStyle = axis.options.tickColor;
        ctx.beginPath();
        for (i = 0; i < axis.ticks.length; ++i) {
          var v = axis.ticks[i].v;
          xoff = yoff = 0;
          if (isNaN(v) || v < axis.min || v > axis.max
          // skip those lying on the axes if we got a border
          || t == "full" && (_typeof(bw) == "object" && bw[axis.position] > 0 || bw > 0) && (v == axis.min || v == axis.max)) continue;
          if (axis.direction == "x") {
            x = axis.p2c(v);
            yoff = t == "full" ? -plotHeight : t;
            if (axis.position == "top") yoff = -yoff;
          } else {
            y = axis.p2c(v);
            xoff = t == "full" ? -plotWidth : t;
            if (axis.position == "left") xoff = -xoff;
          }
          if (ctx.lineWidth == 1) {
            if (axis.direction == "x") x = Math.floor(x) + 0.5;else y = Math.floor(y) + 0.5;
          }
          ctx.moveTo(x, y);
          ctx.lineTo(x + xoff, y + yoff);
        }
        ctx.stroke();
      }

      // draw border
      if (bw) {
        // If either borderWidth or borderColor is an object, then draw the border
        // line by line instead of as one rectangle
        bc = options.grid.borderColor;
        if (_typeof(bw) == "object" || _typeof(bc) == "object") {
          if (_typeof(bw) !== "object") {
            bw = {
              top: bw,
              right: bw,
              bottom: bw,
              left: bw
            };
          }
          if (_typeof(bc) !== "object") {
            bc = {
              top: bc,
              right: bc,
              bottom: bc,
              left: bc
            };
          }
          if (bw.top > 0) {
            ctx.strokeStyle = bc.top;
            ctx.lineWidth = bw.top;
            ctx.beginPath();
            ctx.moveTo(0 - bw.left, 0 - bw.top / 2);
            ctx.lineTo(plotWidth, 0 - bw.top / 2);
            ctx.stroke();
          }
          if (bw.right > 0) {
            ctx.strokeStyle = bc.right;
            ctx.lineWidth = bw.right;
            ctx.beginPath();
            ctx.moveTo(plotWidth + bw.right / 2, 0 - bw.top);
            ctx.lineTo(plotWidth + bw.right / 2, plotHeight);
            ctx.stroke();
          }
          if (bw.bottom > 0) {
            ctx.strokeStyle = bc.bottom;
            ctx.lineWidth = bw.bottom;
            ctx.beginPath();
            ctx.moveTo(plotWidth + bw.right, plotHeight + bw.bottom / 2);
            ctx.lineTo(0, plotHeight + bw.bottom / 2);
            ctx.stroke();
          }
          if (bw.left > 0) {
            ctx.strokeStyle = bc.left;
            ctx.lineWidth = bw.left;
            ctx.beginPath();
            ctx.moveTo(0 - bw.left / 2, plotHeight + bw.bottom);
            ctx.lineTo(0 - bw.left / 2, 0);
            ctx.stroke();
          }
        } else {
          ctx.lineWidth = bw;
          ctx.strokeStyle = options.grid.borderColor;
          ctx.strokeRect(-bw / 2, -bw / 2, plotWidth + bw, plotHeight + bw);
        }
      }
      ctx.restore();
    }
    function drawAxisLabels() {
      $.each(allAxes(), function (_, axis) {
        var box = axis.box,
          legacyStyles = axis.direction + "Axis " + axis.direction + axis.n + "Axis",
          layer = "flot-" + axis.direction + "-axis flot-" + axis.direction + axis.n + "-axis " + legacyStyles,
          font = axis.options.font || "flot-tick-label tickLabel",
          tick,
          x,
          y,
          halign,
          valign;

        // Remove text before checking for axis.show and ticks.length;
        // otherwise plugins, like flot-tickrotor, that draw their own
        // tick labels will end up with both theirs and the defaults.

        surface.removeText(layer);
        if (!axis.show || axis.ticks.length == 0) return;
        for (var i = 0; i < axis.ticks.length; ++i) {
          tick = axis.ticks[i];
          if (!tick.label || tick.v < axis.min || tick.v > axis.max) continue;
          if (axis.direction == "x") {
            halign = "center";
            x = plotOffset.left + axis.p2c(tick.v);
            if (axis.position == "bottom") {
              y = box.top + box.padding;
            } else {
              y = box.top + box.height - box.padding;
              valign = "bottom";
            }
          } else {
            valign = "middle";
            y = plotOffset.top + axis.p2c(tick.v);
            if (axis.position == "left") {
              x = box.left + box.width - box.padding;
              halign = "right";
            } else {
              x = box.left + box.padding;
            }
          }
          surface.addText(layer, x, y, tick.label, font, null, null, halign, valign);
        }
      });
    }
    function drawSeries(series) {
      if (series.lines.show) drawSeriesLines(series);
      if (series.bars.show) drawSeriesBars(series);
      if (series.points.show) drawSeriesPoints(series);
    }
    function drawSeriesLines(series) {
      function plotLine(datapoints, xoffset, yoffset, axisx, axisy) {
        var points = datapoints.points,
          ps = datapoints.pointsize,
          prevx = null,
          prevy = null;
        ctx.beginPath();
        for (var i = ps; i < points.length; i += ps) {
          var x1 = points[i - ps],
            y1 = points[i - ps + 1],
            x2 = points[i],
            y2 = points[i + 1];
          if (x1 == null || x2 == null) continue;

          // clip with ymin
          if (y1 <= y2 && y1 < axisy.min) {
            if (y2 < axisy.min) continue; // line segment is outside
            // compute new intersection point
            x1 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
            y1 = axisy.min;
          } else if (y2 <= y1 && y2 < axisy.min) {
            if (y1 < axisy.min) continue;
            x2 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
            y2 = axisy.min;
          }

          // clip with ymax
          if (y1 >= y2 && y1 > axisy.max) {
            if (y2 > axisy.max) continue;
            x1 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
            y1 = axisy.max;
          } else if (y2 >= y1 && y2 > axisy.max) {
            if (y1 > axisy.max) continue;
            x2 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
            y2 = axisy.max;
          }

          // clip with xmin
          if (x1 <= x2 && x1 < axisx.min) {
            if (x2 < axisx.min) continue;
            y1 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
            x1 = axisx.min;
          } else if (x2 <= x1 && x2 < axisx.min) {
            if (x1 < axisx.min) continue;
            y2 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
            x2 = axisx.min;
          }

          // clip with xmax
          if (x1 >= x2 && x1 > axisx.max) {
            if (x2 > axisx.max) continue;
            y1 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
            x1 = axisx.max;
          } else if (x2 >= x1 && x2 > axisx.max) {
            if (x1 > axisx.max) continue;
            y2 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
            x2 = axisx.max;
          }
          if (x1 != prevx || y1 != prevy) ctx.moveTo(axisx.p2c(x1) + xoffset, axisy.p2c(y1) + yoffset);
          prevx = x2;
          prevy = y2;
          ctx.lineTo(axisx.p2c(x2) + xoffset, axisy.p2c(y2) + yoffset);
        }
        ctx.stroke();
      }
      function plotLineArea(datapoints, axisx, axisy) {
        var points = datapoints.points,
          ps = datapoints.pointsize,
          bottom = Math.min(Math.max(0, axisy.min), axisy.max),
          i = 0,
          top,
          areaOpen = false,
          ypos = 1,
          segmentStart = 0,
          segmentEnd = 0;

        // we process each segment in two turns, first forward
        // direction to sketch out top, then once we hit the
        // end we go backwards to sketch the bottom
        while (true) {
          if (ps > 0 && i > points.length + ps) break;
          i += ps; // ps is negative if going backwards

          var x1 = points[i - ps],
            y1 = points[i - ps + ypos],
            x2 = points[i],
            y2 = points[i + ypos];
          if (areaOpen) {
            if (ps > 0 && x1 != null && x2 == null) {
              // at turning point
              segmentEnd = i;
              ps = -ps;
              ypos = 2;
              continue;
            }
            if (ps < 0 && i == segmentStart + ps) {
              // done with the reverse sweep
              ctx.fill();
              areaOpen = false;
              ps = -ps;
              ypos = 1;
              i = segmentStart = segmentEnd + ps;
              continue;
            }
          }
          if (x1 == null || x2 == null) continue;

          // clip x values

          // clip with xmin
          if (x1 <= x2 && x1 < axisx.min) {
            if (x2 < axisx.min) continue;
            y1 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
            x1 = axisx.min;
          } else if (x2 <= x1 && x2 < axisx.min) {
            if (x1 < axisx.min) continue;
            y2 = (axisx.min - x1) / (x2 - x1) * (y2 - y1) + y1;
            x2 = axisx.min;
          }

          // clip with xmax
          if (x1 >= x2 && x1 > axisx.max) {
            if (x2 > axisx.max) continue;
            y1 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
            x1 = axisx.max;
          } else if (x2 >= x1 && x2 > axisx.max) {
            if (x1 > axisx.max) continue;
            y2 = (axisx.max - x1) / (x2 - x1) * (y2 - y1) + y1;
            x2 = axisx.max;
          }
          if (!areaOpen) {
            // open area
            ctx.beginPath();
            ctx.moveTo(axisx.p2c(x1), axisy.p2c(bottom));
            areaOpen = true;
          }

          // now first check the case where both is outside
          if (y1 >= axisy.max && y2 >= axisy.max) {
            ctx.lineTo(axisx.p2c(x1), axisy.p2c(axisy.max));
            ctx.lineTo(axisx.p2c(x2), axisy.p2c(axisy.max));
            continue;
          } else if (y1 <= axisy.min && y2 <= axisy.min) {
            ctx.lineTo(axisx.p2c(x1), axisy.p2c(axisy.min));
            ctx.lineTo(axisx.p2c(x2), axisy.p2c(axisy.min));
            continue;
          }

          // else it's a bit more complicated, there might
          // be a flat maxed out rectangle first, then a
          // triangular cutout or reverse; to find these
          // keep track of the current x values
          var x1old = x1,
            x2old = x2;

          // clip the y values, without shortcutting, we
          // go through all cases in turn

          // clip with ymin
          if (y1 <= y2 && y1 < axisy.min && y2 >= axisy.min) {
            x1 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
            y1 = axisy.min;
          } else if (y2 <= y1 && y2 < axisy.min && y1 >= axisy.min) {
            x2 = (axisy.min - y1) / (y2 - y1) * (x2 - x1) + x1;
            y2 = axisy.min;
          }

          // clip with ymax
          if (y1 >= y2 && y1 > axisy.max && y2 <= axisy.max) {
            x1 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
            y1 = axisy.max;
          } else if (y2 >= y1 && y2 > axisy.max && y1 <= axisy.max) {
            x2 = (axisy.max - y1) / (y2 - y1) * (x2 - x1) + x1;
            y2 = axisy.max;
          }

          // if the x value was changed we got a rectangle
          // to fill
          if (x1 != x1old) {
            ctx.lineTo(axisx.p2c(x1old), axisy.p2c(y1));
            // it goes to (x1, y1), but we fill that below
          }

          // fill triangular section, this sometimes result
          // in redundant points if (x1, y1) hasn't changed
          // from previous line to, but we just ignore that
          ctx.lineTo(axisx.p2c(x1), axisy.p2c(y1));
          ctx.lineTo(axisx.p2c(x2), axisy.p2c(y2));

          // fill the other rectangle if it's there
          if (x2 != x2old) {
            ctx.lineTo(axisx.p2c(x2), axisy.p2c(y2));
            ctx.lineTo(axisx.p2c(x2old), axisy.p2c(y2));
          }
        }
      }
      ctx.save();
      ctx.translate(plotOffset.left, plotOffset.top);
      ctx.lineJoin = "round";
      var lw = series.lines.lineWidth,
        sw = series.shadowSize;
      // FIXME: consider another form of shadow when filling is turned on
      if (lw > 0 && sw > 0) {
        // draw shadow as a thick and thin line with transparency
        ctx.lineWidth = sw;
        ctx.strokeStyle = "rgba(0,0,0,0.1)";
        // position shadow at angle from the mid of line
        var angle = Math.PI / 18;
        plotLine(series.datapoints, Math.sin(angle) * (lw / 2 + sw / 2), Math.cos(angle) * (lw / 2 + sw / 2), series.xaxis, series.yaxis);
        ctx.lineWidth = sw / 2;
        plotLine(series.datapoints, Math.sin(angle) * (lw / 2 + sw / 4), Math.cos(angle) * (lw / 2 + sw / 4), series.xaxis, series.yaxis);
      }
      ctx.lineWidth = lw;
      ctx.strokeStyle = series.color;
      var fillStyle = getFillStyle(series.lines, series.color, 0, plotHeight);
      if (fillStyle) {
        ctx.fillStyle = fillStyle;
        plotLineArea(series.datapoints, series.xaxis, series.yaxis);
      }
      if (lw > 0) plotLine(series.datapoints, 0, 0, series.xaxis, series.yaxis);
      ctx.restore();
    }
    function drawSeriesPoints(series) {
      function plotPoints(datapoints, radius, fillStyle, offset, shadow, axisx, axisy, symbol) {
        var points = datapoints.points,
          ps = datapoints.pointsize;
        for (var i = 0; i < points.length; i += ps) {
          var x = points[i],
            y = points[i + 1];
          if (x == null || x < axisx.min || x > axisx.max || y < axisy.min || y > axisy.max) continue;
          ctx.beginPath();
          x = axisx.p2c(x);
          y = axisy.p2c(y) + offset;
          if (symbol == "circle") ctx.arc(x, y, radius, 0, shadow ? Math.PI : Math.PI * 2, false);else symbol(ctx, x, y, radius, shadow);
          ctx.closePath();
          if (fillStyle) {
            ctx.fillStyle = fillStyle;
            ctx.fill();
          }
          ctx.stroke();
        }
      }
      ctx.save();
      ctx.translate(plotOffset.left, plotOffset.top);
      var lw = series.points.lineWidth,
        sw = series.shadowSize,
        radius = series.points.radius,
        symbol = series.points.symbol;

      // If the user sets the line width to 0, we change it to a very 
      // small value. A line width of 0 seems to force the default of 1.
      // Doing the conditional here allows the shadow setting to still be 
      // optional even with a lineWidth of 0.

      if (lw == 0) lw = 0.0001;
      if (lw > 0 && sw > 0) {
        // draw shadow in two steps
        var w = sw / 2;
        ctx.lineWidth = w;
        ctx.strokeStyle = "rgba(0,0,0,0.1)";
        plotPoints(series.datapoints, radius, null, w + w / 2, true, series.xaxis, series.yaxis, symbol);
        ctx.strokeStyle = "rgba(0,0,0,0.2)";
        plotPoints(series.datapoints, radius, null, w / 2, true, series.xaxis, series.yaxis, symbol);
      }
      ctx.lineWidth = lw;
      ctx.strokeStyle = series.color;
      plotPoints(series.datapoints, radius, getFillStyle(series.points, series.color), 0, false, series.xaxis, series.yaxis, symbol);
      ctx.restore();
    }
    function drawBar(x, y, b, barLeft, barRight, fillStyleCallback, axisx, axisy, c, horizontal, lineWidth) {
      var left, right, bottom, top, drawLeft, drawRight, drawTop, drawBottom, tmp;

      // in horizontal mode, we start the bar from the left
      // instead of from the bottom so it appears to be
      // horizontal rather than vertical
      if (horizontal) {
        drawBottom = drawRight = drawTop = true;
        drawLeft = false;
        left = b;
        right = x;
        top = y + barLeft;
        bottom = y + barRight;

        // account for negative bars
        if (right < left) {
          tmp = right;
          right = left;
          left = tmp;
          drawLeft = true;
          drawRight = false;
        }
      } else {
        drawLeft = drawRight = drawTop = true;
        drawBottom = false;
        left = x + barLeft;
        right = x + barRight;
        bottom = b;
        top = y;

        // account for negative bars
        if (top < bottom) {
          tmp = top;
          top = bottom;
          bottom = tmp;
          drawBottom = true;
          drawTop = false;
        }
      }

      // clip
      if (right < axisx.min || left > axisx.max || top < axisy.min || bottom > axisy.max) return;
      if (left < axisx.min) {
        left = axisx.min;
        drawLeft = false;
      }
      if (right > axisx.max) {
        right = axisx.max;
        drawRight = false;
      }
      if (bottom < axisy.min) {
        bottom = axisy.min;
        drawBottom = false;
      }
      if (top > axisy.max) {
        top = axisy.max;
        drawTop = false;
      }
      left = axisx.p2c(left);
      bottom = axisy.p2c(bottom);
      right = axisx.p2c(right);
      top = axisy.p2c(top);

      // fill the bar
      if (fillStyleCallback) {
        c.fillStyle = fillStyleCallback(bottom, top);
        c.fillRect(left, top, right - left, bottom - top);
      }

      // draw outline
      if (lineWidth > 0 && (drawLeft || drawRight || drawTop || drawBottom)) {
        c.beginPath();

        // FIXME: inline moveTo is buggy with excanvas
        c.moveTo(left, bottom);
        if (drawLeft) c.lineTo(left, top);else c.moveTo(left, top);
        if (drawTop) c.lineTo(right, top);else c.moveTo(right, top);
        if (drawRight) c.lineTo(right, bottom);else c.moveTo(right, bottom);
        if (drawBottom) c.lineTo(left, bottom);else c.moveTo(left, bottom);
        c.stroke();
      }
    }
    function drawSeriesBars(series) {
      function plotBars(datapoints, barLeft, barRight, fillStyleCallback, axisx, axisy) {
        var points = datapoints.points,
          ps = datapoints.pointsize;
        for (var i = 0; i < points.length; i += ps) {
          if (points[i] == null) continue;
          drawBar(points[i], points[i + 1], points[i + 2], barLeft, barRight, fillStyleCallback, axisx, axisy, ctx, series.bars.horizontal, series.bars.lineWidth);
        }
      }
      ctx.save();
      ctx.translate(plotOffset.left, plotOffset.top);

      // FIXME: figure out a way to add shadows (for instance along the right edge)
      ctx.lineWidth = series.bars.lineWidth;
      ctx.strokeStyle = series.color;
      var barLeft;
      switch (series.bars.align) {
        case "left":
          barLeft = 0;
          break;
        case "right":
          barLeft = -series.bars.barWidth;
          break;
        default:
          barLeft = -series.bars.barWidth / 2;
      }
      var fillStyleCallback = series.bars.fill ? function (bottom, top) {
        return getFillStyle(series.bars, series.color, bottom, top);
      } : null;
      plotBars(series.datapoints, barLeft, barLeft + series.bars.barWidth, fillStyleCallback, series.xaxis, series.yaxis);
      ctx.restore();
    }
    function getFillStyle(filloptions, seriesColor, bottom, top) {
      var fill = filloptions.fill;
      if (!fill) return null;
      if (filloptions.fillColor) return getColorOrGradient(filloptions.fillColor, bottom, top, seriesColor);
      var c = $.color.parse(seriesColor);
      c.a = typeof fill == "number" ? fill : 0.4;
      c.normalize();
      return c.toString();
    }
    function insertLegend() {
      if (options.legend.container != null) {
        $(options.legend.container).html("");
      } else {
        placeholder.find(".legend").remove();
      }
      if (!options.legend.show) {
        return;
      }
      var fragments = [],
        entries = [],
        rowStarted = false,
        lf = options.legend.labelFormatter,
        s,
        label;

      // Build a list of legend entries, with each having a label and a color

      for (var i = 0; i < series.length; ++i) {
        s = series[i];
        if (s.label) {
          label = lf ? lf(s.label, s) : s.label;
          if (label) {
            entries.push({
              label: label,
              color: s.color
            });
          }
        }
      }

      // Sort the legend using either the default or a custom comparator

      if (options.legend.sorted) {
        if ($.isFunction(options.legend.sorted)) {
          entries.sort(options.legend.sorted);
        } else if (options.legend.sorted == "reverse") {
          entries.reverse();
        } else {
          var ascending = options.legend.sorted != "descending";
          entries.sort(function (a, b) {
            return a.label == b.label ? 0 : a.label < b.label != ascending ? 1 : -1 // Logical XOR
            ;
          });
        }
      }

      // Generate markup for the list of entries, in their final order

      for (var i = 0; i < entries.length; ++i) {
        var entry = entries[i];
        if (i % options.legend.noColumns == 0) {
          if (rowStarted) fragments.push('</tr>');
          fragments.push('<tr>');
          rowStarted = true;
        }
        fragments.push('<td class="legendColorBox"><div style="border:1px solid ' + options.legend.labelBoxBorderColor + ';padding:1px"><div style="width:4px;height:0;border:5px solid ' + entry.color + ';overflow:hidden"></div></div></td>' + '<td class="legendLabel">' + entry.label + '</td>');
      }
      if (rowStarted) fragments.push('</tr>');
      if (fragments.length == 0) return;
      var table = '<table style="font-size:smaller;color:' + options.grid.color + '">' + fragments.join("") + '</table>';
      if (options.legend.container != null) $(options.legend.container).html(table);else {
        var pos = "",
          p = options.legend.position,
          m = options.legend.margin;
        if (m[0] == null) m = [m, m];
        if (p.charAt(0) == "n") pos += 'top:' + (m[1] + plotOffset.top) + 'px;';else if (p.charAt(0) == "s") pos += 'bottom:' + (m[1] + plotOffset.bottom) + 'px;';
        if (p.charAt(1) == "e") pos += 'right:' + (m[0] + plotOffset.right) + 'px;';else if (p.charAt(1) == "w") pos += 'left:' + (m[0] + plotOffset.left) + 'px;';
        var legend = $('<div class="legend">' + table.replace('style="', 'style="position:absolute;' + pos + ';') + '</div>').appendTo(placeholder);
        if (options.legend.backgroundOpacity != 0.0) {
          // put in the transparent background
          // separately to avoid blended labels and
          // label boxes
          var c = options.legend.backgroundColor;
          if (c == null) {
            c = options.grid.backgroundColor;
            if (c && typeof c == "string") c = $.color.parse(c);else c = $.color.extract(legend, 'background-color');
            c.a = 1;
            c = c.toString();
          }
          var div = legend.children();
          $('<div style="position:absolute;width:' + div.width() + 'px;height:' + div.height() + 'px;' + pos + 'background-color:' + c + ';"> </div>').prependTo(legend).css('opacity', options.legend.backgroundOpacity);
        }
      }
    }

    // interactive features

    var highlights = [],
      redrawTimeout = null;

    // returns the data item the mouse is over, or null if none is found
    function findNearbyItem(mouseX, mouseY, seriesFilter) {
      var maxDistance = options.grid.mouseActiveRadius,
        smallestDistance = maxDistance * maxDistance + 1,
        item = null,
        foundPoint = false,
        i,
        j,
        ps;
      for (i = series.length - 1; i >= 0; --i) {
        if (!seriesFilter(series[i])) continue;
        var s = series[i],
          axisx = s.xaxis,
          axisy = s.yaxis,
          points = s.datapoints.points,
          mx = axisx.c2p(mouseX),
          // precompute some stuff to make the loop faster
          my = axisy.c2p(mouseY),
          maxx = maxDistance / axisx.scale,
          maxy = maxDistance / axisy.scale;
        ps = s.datapoints.pointsize;
        // with inverse transforms, we can't use the maxx/maxy
        // optimization, sadly
        if (axisx.options.inverseTransform) maxx = Number.MAX_VALUE;
        if (axisy.options.inverseTransform) maxy = Number.MAX_VALUE;
        if (s.lines.show || s.points.show) {
          for (j = 0; j < points.length; j += ps) {
            var x = points[j],
              y = points[j + 1];
            if (x == null) continue;

            // For points and lines, the cursor must be within a
            // certain distance to the data point
            if (x - mx > maxx || x - mx < -maxx || y - my > maxy || y - my < -maxy) continue;

            // We have to calculate distances in pixels, not in
            // data units, because the scales of the axes may be different
            var dx = Math.abs(axisx.p2c(x) - mouseX),
              dy = Math.abs(axisy.p2c(y) - mouseY),
              dist = dx * dx + dy * dy; // we save the sqrt

            // use <= to ensure last point takes precedence
            // (last generally means on top of)
            if (dist < smallestDistance) {
              smallestDistance = dist;
              item = [i, j / ps];
            }
          }
        }
        if (s.bars.show && !item) {
          // no other point can be nearby

          var barLeft, barRight;
          switch (s.bars.align) {
            case "left":
              barLeft = 0;
              break;
            case "right":
              barLeft = -s.bars.barWidth;
              break;
            default:
              barLeft = -s.bars.barWidth / 2;
          }
          barRight = barLeft + s.bars.barWidth;
          for (j = 0; j < points.length; j += ps) {
            var x = points[j],
              y = points[j + 1],
              b = points[j + 2];
            if (x == null) continue;

            // for a bar graph, the cursor must be inside the bar
            if (series[i].bars.horizontal ? mx <= Math.max(b, x) && mx >= Math.min(b, x) && my >= y + barLeft && my <= y + barRight : mx >= x + barLeft && mx <= x + barRight && my >= Math.min(b, y) && my <= Math.max(b, y)) item = [i, j / ps];
          }
        }
      }
      if (item) {
        i = item[0];
        j = item[1];
        ps = series[i].datapoints.pointsize;
        return {
          datapoint: series[i].datapoints.points.slice(j * ps, (j + 1) * ps),
          dataIndex: j,
          series: series[i],
          seriesIndex: i
        };
      }
      return null;
    }
    function onMouseMove(e) {
      if (options.grid.hoverable) triggerClickHoverEvent("plothover", e, function (s) {
        return s["hoverable"] != false;
      });
    }
    function onMouseLeave(e) {
      if (options.grid.hoverable) triggerClickHoverEvent("plothover", e, function (s) {
        return false;
      });
    }
    function onClick(e) {
      triggerClickHoverEvent("plotclick", e, function (s) {
        return s["clickable"] != false;
      });
    }

    // trigger click or hover event (they send the same parameters
    // so we share their code)
    function triggerClickHoverEvent(eventname, event, seriesFilter) {
      var offset = eventHolder.offset(),
        canvasX = event.pageX - offset.left - plotOffset.left,
        canvasY = event.pageY - offset.top - plotOffset.top,
        pos = canvasToAxisCoords({
          left: canvasX,
          top: canvasY
        });
      pos.pageX = event.pageX;
      pos.pageY = event.pageY;
      var item = findNearbyItem(canvasX, canvasY, seriesFilter);
      if (item) {
        // fill in mouse pos for any listeners out there
        item.pageX = parseInt(item.series.xaxis.p2c(item.datapoint[0]) + offset.left + plotOffset.left, 10);
        item.pageY = parseInt(item.series.yaxis.p2c(item.datapoint[1]) + offset.top + plotOffset.top, 10);
      }
      if (options.grid.autoHighlight) {
        // clear auto-highlights
        for (var i = 0; i < highlights.length; ++i) {
          var h = highlights[i];
          if (h.auto == eventname && !(item && h.series == item.series && h.point[0] == item.datapoint[0] && h.point[1] == item.datapoint[1])) unhighlight(h.series, h.point);
        }
        if (item) highlight(item.series, item.datapoint, eventname);
      }
      placeholder.trigger(eventname, [pos, item]);
    }
    function triggerRedrawOverlay() {
      var t = options.interaction.redrawOverlayInterval;
      if (t == -1) {
        // skip event queue
        drawOverlay();
        return;
      }
      if (!redrawTimeout) redrawTimeout = setTimeout(drawOverlay, t);
    }
    function drawOverlay() {
      redrawTimeout = null;

      // draw highlights
      octx.save();
      overlay.clear();
      octx.translate(plotOffset.left, plotOffset.top);
      var i, hi;
      for (i = 0; i < highlights.length; ++i) {
        hi = highlights[i];
        if (hi.series.bars.show) drawBarHighlight(hi.series, hi.point);else drawPointHighlight(hi.series, hi.point);
      }
      octx.restore();
      executeHooks(hooks.drawOverlay, [octx]);
    }
    function highlight(s, point, auto) {
      if (typeof s == "number") s = series[s];
      if (typeof point == "number") {
        var ps = s.datapoints.pointsize;
        point = s.datapoints.points.slice(ps * point, ps * (point + 1));
      }
      var i = indexOfHighlight(s, point);
      if (i == -1) {
        highlights.push({
          series: s,
          point: point,
          auto: auto
        });
        triggerRedrawOverlay();
      } else if (!auto) highlights[i].auto = false;
    }
    function unhighlight(s, point) {
      if (s == null && point == null) {
        highlights = [];
        triggerRedrawOverlay();
        return;
      }
      if (typeof s == "number") s = series[s];
      if (typeof point == "number") {
        var ps = s.datapoints.pointsize;
        point = s.datapoints.points.slice(ps * point, ps * (point + 1));
      }
      var i = indexOfHighlight(s, point);
      if (i != -1) {
        highlights.splice(i, 1);
        triggerRedrawOverlay();
      }
    }
    function indexOfHighlight(s, p) {
      for (var i = 0; i < highlights.length; ++i) {
        var h = highlights[i];
        if (h.series == s && h.point[0] == p[0] && h.point[1] == p[1]) return i;
      }
      return -1;
    }
    function drawPointHighlight(series, point) {
      var x = point[0],
        y = point[1],
        axisx = series.xaxis,
        axisy = series.yaxis,
        highlightColor = typeof series.highlightColor === "string" ? series.highlightColor : $.color.parse(series.color).scale('a', 0.5).toString();
      if (x < axisx.min || x > axisx.max || y < axisy.min || y > axisy.max) return;
      var pointRadius = series.points.radius + series.points.lineWidth / 2;
      octx.lineWidth = pointRadius;
      octx.strokeStyle = highlightColor;
      var radius = 1.5 * pointRadius;
      x = axisx.p2c(x);
      y = axisy.p2c(y);
      octx.beginPath();
      if (series.points.symbol == "circle") octx.arc(x, y, radius, 0, 2 * Math.PI, false);else series.points.symbol(octx, x, y, radius, false);
      octx.closePath();
      octx.stroke();
    }
    function drawBarHighlight(series, point) {
      var highlightColor = typeof series.highlightColor === "string" ? series.highlightColor : $.color.parse(series.color).scale('a', 0.5).toString(),
        fillStyle = highlightColor,
        barLeft;
      switch (series.bars.align) {
        case "left":
          barLeft = 0;
          break;
        case "right":
          barLeft = -series.bars.barWidth;
          break;
        default:
          barLeft = -series.bars.barWidth / 2;
      }
      octx.lineWidth = series.bars.lineWidth;
      octx.strokeStyle = highlightColor;
      drawBar(point[0], point[1], point[2] || 0, barLeft, barLeft + series.bars.barWidth, function () {
        return fillStyle;
      }, series.xaxis, series.yaxis, octx, series.bars.horizontal, series.bars.lineWidth);
    }
    function getColorOrGradient(spec, bottom, top, defaultColor) {
      if (typeof spec == "string") return spec;else {
        // assume this is a gradient spec; IE currently only
        // supports a simple vertical gradient properly, so that's
        // what we support too
        var gradient = ctx.createLinearGradient(0, top, 0, bottom);
        for (var i = 0, l = spec.colors.length; i < l; ++i) {
          var c = spec.colors[i];
          if (typeof c != "string") {
            var co = $.color.parse(defaultColor);
            if (c.brightness != null) co = co.scale('rgb', c.brightness);
            if (c.opacity != null) co.a *= c.opacity;
            c = co.toString();
          }
          gradient.addColorStop(i / (l - 1), c);
        }
        return gradient;
      }
    }
  }

  // Add the plot function to the top level of the jQuery object

  $.plot = function (placeholder, data, options) {
    //var t0 = new Date();
    var plot = new Plot($(placeholder), data, options, $.plot.plugins);
    //(window.console ? console.log : alert)("time used (msecs): " + ((new Date()).getTime() - t0.getTime()));
    return plot;
  };
  $.plot.version = "0.8.3";
  $.plot.plugins = [];

  // Also add the plot function as a chainable property

  $.fn.plot = function (data, options) {
    return this.each(function () {
      $.plot(this, data, options);
    });
  };

  // round to nearby lower multiple of base
  function floorInBase(n, base) {
    return base * Math.floor(n / base);
  }
})(jQuery);
},{}],116:[function(require,module,exports){
"use strict";

/* Pretty handling of time axes.

Copyright (c) 2007-2014 IOLA and Ole Laursen.
Licensed under the MIT license.

Set axis.mode to "time" to enable. See the section "Time series data" in
API.txt for details.

*/

(function ($) {
  var options = {
    xaxis: {
      timezone: null,
      // "browser" for local to the client or timezone for timezone-js
      timeformat: null,
      // format string to use
      twelveHourClock: false,
      // 12 or 24 time in time mode
      monthNames: null // list of names of months
    }
  };

  // round to nearby lower multiple of base

  function floorInBase(n, base) {
    return base * Math.floor(n / base);
  }

  // Returns a string with the date d formatted according to fmt.
  // A subset of the Open Group's strftime format is supported.

  function formatDate(d, fmt, monthNames, dayNames) {
    if (typeof d.strftime == "function") {
      return d.strftime(fmt);
    }
    var leftPad = function leftPad(n, pad) {
      n = "" + n;
      pad = "" + (pad == null ? "0" : pad);
      return n.length == 1 ? pad + n : n;
    };
    var r = [];
    var escape = false;
    var hours = d.getHours();
    var isAM = hours < 12;
    if (monthNames == null) {
      monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    }
    if (dayNames == null) {
      dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    }
    var hours12;
    if (hours > 12) {
      hours12 = hours - 12;
    } else if (hours == 0) {
      hours12 = 12;
    } else {
      hours12 = hours;
    }
    for (var i = 0; i < fmt.length; ++i) {
      var c = fmt.charAt(i);
      if (escape) {
        switch (c) {
          case 'a':
            c = "" + dayNames[d.getDay()];
            break;
          case 'b':
            c = "" + monthNames[d.getMonth()];
            break;
          case 'd':
            c = leftPad(d.getDate());
            break;
          case 'e':
            c = leftPad(d.getDate(), " ");
            break;
          case 'h': // For back-compat with 0.7; remove in 1.0
          case 'H':
            c = leftPad(hours);
            break;
          case 'I':
            c = leftPad(hours12);
            break;
          case 'l':
            c = leftPad(hours12, " ");
            break;
          case 'm':
            c = leftPad(d.getMonth() + 1);
            break;
          case 'M':
            c = leftPad(d.getMinutes());
            break;
          // quarters not in Open Group's strftime specification
          case 'q':
            c = "" + (Math.floor(d.getMonth() / 3) + 1);
            break;
          case 'S':
            c = leftPad(d.getSeconds());
            break;
          case 'y':
            c = leftPad(d.getFullYear() % 100);
            break;
          case 'Y':
            c = "" + d.getFullYear();
            break;
          case 'p':
            c = isAM ? "" + "am" : "" + "pm";
            break;
          case 'P':
            c = isAM ? "" + "AM" : "" + "PM";
            break;
          case 'w':
            c = "" + d.getDay();
            break;
        }
        r.push(c);
        escape = false;
      } else {
        if (c == "%") {
          escape = true;
        } else {
          r.push(c);
        }
      }
    }
    return r.join("");
  }

  // To have a consistent view of time-based data independent of which time
  // zone the client happens to be in we need a date-like object independent
  // of time zones.  This is done through a wrapper that only calls the UTC
  // versions of the accessor methods.

  function makeUtcWrapper(d) {
    function addProxyMethod(sourceObj, sourceMethod, targetObj, targetMethod) {
      sourceObj[sourceMethod] = function () {
        return targetObj[targetMethod].apply(targetObj, arguments);
      };
    }
    ;
    var utc = {
      date: d
    };

    // support strftime, if found

    if (d.strftime != undefined) {
      addProxyMethod(utc, "strftime", d, "strftime");
    }
    addProxyMethod(utc, "getTime", d, "getTime");
    addProxyMethod(utc, "setTime", d, "setTime");
    var props = ["Date", "Day", "FullYear", "Hours", "Milliseconds", "Minutes", "Month", "Seconds"];
    for (var p = 0; p < props.length; p++) {
      addProxyMethod(utc, "get" + props[p], d, "getUTC" + props[p]);
      addProxyMethod(utc, "set" + props[p], d, "setUTC" + props[p]);
    }
    return utc;
  }
  ;

  // select time zone strategy.  This returns a date-like object tied to the
  // desired timezone

  function dateGenerator(ts, opts) {
    if (opts.timezone == "browser") {
      return new Date(ts);
    } else if (!opts.timezone || opts.timezone == "utc") {
      return makeUtcWrapper(new Date(ts));
    } else if (typeof timezoneJS != "undefined" && typeof timezoneJS.Date != "undefined") {
      var d = new timezoneJS.Date();
      // timezone-js is fickle, so be sure to set the time zone before
      // setting the time.
      d.setTimezone(opts.timezone);
      d.setTime(ts);
      return d;
    } else {
      return makeUtcWrapper(new Date(ts));
    }
  }

  // map of app. size of time units in milliseconds

  var timeUnitSize = {
    "second": 1000,
    "minute": 60 * 1000,
    "hour": 60 * 60 * 1000,
    "day": 24 * 60 * 60 * 1000,
    "month": 30 * 24 * 60 * 60 * 1000,
    "quarter": 3 * 30 * 24 * 60 * 60 * 1000,
    "year": 365.2425 * 24 * 60 * 60 * 1000
  };

  // the allowed tick sizes, after 1 year we use
  // an integer algorithm

  var baseSpec = [[1, "second"], [2, "second"], [5, "second"], [10, "second"], [30, "second"], [1, "minute"], [2, "minute"], [5, "minute"], [10, "minute"], [30, "minute"], [1, "hour"], [2, "hour"], [4, "hour"], [8, "hour"], [12, "hour"], [1, "day"], [2, "day"], [3, "day"], [0.25, "month"], [0.5, "month"], [1, "month"], [2, "month"]];

  // we don't know which variant(s) we'll need yet, but generating both is
  // cheap

  var specMonths = baseSpec.concat([[3, "month"], [6, "month"], [1, "year"]]);
  var specQuarters = baseSpec.concat([[1, "quarter"], [2, "quarter"], [1, "year"]]);
  function init(plot) {
    plot.hooks.processOptions.push(function (plot, options) {
      $.each(plot.getAxes(), function (axisName, axis) {
        var opts = axis.options;
        if (opts.mode == "time") {
          axis.tickGenerator = function (axis) {
            var ticks = [];
            var d = dateGenerator(axis.min, opts);
            var minSize = 0;

            // make quarter use a possibility if quarters are
            // mentioned in either of these options

            var spec = opts.tickSize && opts.tickSize[1] === "quarter" || opts.minTickSize && opts.minTickSize[1] === "quarter" ? specQuarters : specMonths;
            if (opts.minTickSize != null) {
              if (typeof opts.tickSize == "number") {
                minSize = opts.tickSize;
              } else {
                minSize = opts.minTickSize[0] * timeUnitSize[opts.minTickSize[1]];
              }
            }
            for (var i = 0; i < spec.length - 1; ++i) {
              if (axis.delta < (spec[i][0] * timeUnitSize[spec[i][1]] + spec[i + 1][0] * timeUnitSize[spec[i + 1][1]]) / 2 && spec[i][0] * timeUnitSize[spec[i][1]] >= minSize) {
                break;
              }
            }
            var size = spec[i][0];
            var unit = spec[i][1];

            // special-case the possibility of several years

            if (unit == "year") {
              // if given a minTickSize in years, just use it,
              // ensuring that it's an integer

              if (opts.minTickSize != null && opts.minTickSize[1] == "year") {
                size = Math.floor(opts.minTickSize[0]);
              } else {
                var magn = Math.pow(10, Math.floor(Math.log(axis.delta / timeUnitSize.year) / Math.LN10));
                var norm = axis.delta / timeUnitSize.year / magn;
                if (norm < 1.5) {
                  size = 1;
                } else if (norm < 3) {
                  size = 2;
                } else if (norm < 7.5) {
                  size = 5;
                } else {
                  size = 10;
                }
                size *= magn;
              }

              // minimum size for years is 1

              if (size < 1) {
                size = 1;
              }
            }
            axis.tickSize = opts.tickSize || [size, unit];
            var tickSize = axis.tickSize[0];
            unit = axis.tickSize[1];
            var step = tickSize * timeUnitSize[unit];
            if (unit == "second") {
              d.setSeconds(floorInBase(d.getSeconds(), tickSize));
            } else if (unit == "minute") {
              d.setMinutes(floorInBase(d.getMinutes(), tickSize));
            } else if (unit == "hour") {
              d.setHours(floorInBase(d.getHours(), tickSize));
            } else if (unit == "month") {
              d.setMonth(floorInBase(d.getMonth(), tickSize));
            } else if (unit == "quarter") {
              d.setMonth(3 * floorInBase(d.getMonth() / 3, tickSize));
            } else if (unit == "year") {
              d.setFullYear(floorInBase(d.getFullYear(), tickSize));
            }

            // reset smaller components

            d.setMilliseconds(0);
            if (step >= timeUnitSize.minute) {
              d.setSeconds(0);
            }
            if (step >= timeUnitSize.hour) {
              d.setMinutes(0);
            }
            if (step >= timeUnitSize.day) {
              d.setHours(0);
            }
            if (step >= timeUnitSize.day * 4) {
              d.setDate(1);
            }
            if (step >= timeUnitSize.month * 2) {
              d.setMonth(floorInBase(d.getMonth(), 3));
            }
            if (step >= timeUnitSize.quarter * 2) {
              d.setMonth(floorInBase(d.getMonth(), 6));
            }
            if (step >= timeUnitSize.year) {
              d.setMonth(0);
            }
            var carry = 0;
            var v = Number.NaN;
            var prev;
            do {
              prev = v;
              v = d.getTime();
              ticks.push(v);
              if (unit == "month" || unit == "quarter") {
                if (tickSize < 1) {
                  // a bit complicated - we'll divide the
                  // month/quarter up but we need to take
                  // care of fractions so we don't end up in
                  // the middle of a day

                  d.setDate(1);
                  var start = d.getTime();
                  d.setMonth(d.getMonth() + (unit == "quarter" ? 3 : 1));
                  var end = d.getTime();
                  d.setTime(v + carry * timeUnitSize.hour + (end - start) * tickSize);
                  carry = d.getHours();
                  d.setHours(0);
                } else {
                  d.setMonth(d.getMonth() + tickSize * (unit == "quarter" ? 3 : 1));
                }
              } else if (unit == "year") {
                d.setFullYear(d.getFullYear() + tickSize);
              } else {
                d.setTime(v + step);
              }
            } while (v < axis.max && v != prev);
            return ticks;
          };
          axis.tickFormatter = function (v, axis) {
            var d = dateGenerator(v, axis.options);

            // first check global format

            if (opts.timeformat != null) {
              return formatDate(d, opts.timeformat, opts.monthNames, opts.dayNames);
            }

            // possibly use quarters if quarters are mentioned in
            // any of these places

            var useQuarters = axis.options.tickSize && axis.options.tickSize[1] == "quarter" || axis.options.minTickSize && axis.options.minTickSize[1] == "quarter";
            var t = axis.tickSize[0] * timeUnitSize[axis.tickSize[1]];
            var span = axis.max - axis.min;
            var suffix = opts.twelveHourClock ? " %p" : "";
            var hourCode = opts.twelveHourClock ? "%I" : "%H";
            var fmt;
            if (t < timeUnitSize.minute) {
              fmt = hourCode + ":%M:%S" + suffix;
            } else if (t < timeUnitSize.day) {
              if (span < 2 * timeUnitSize.day) {
                fmt = hourCode + ":%M" + suffix;
              } else {
                fmt = "%b %d " + hourCode + ":%M" + suffix;
              }
            } else if (t < timeUnitSize.month) {
              fmt = "%b %d";
            } else if (useQuarters && t < timeUnitSize.quarter || !useQuarters && t < timeUnitSize.year) {
              if (span < timeUnitSize.year) {
                fmt = "%b";
              } else {
                fmt = "%b %Y";
              }
            } else if (useQuarters && t < timeUnitSize.year) {
              if (span < timeUnitSize.year) {
                fmt = "Q%q";
              } else {
                fmt = "Q%q %Y";
              }
            } else {
              fmt = "%Y";
            }
            var rt = formatDate(d, fmt, opts.monthNames, opts.dayNames);
            return rt;
          };
        }
      });
    });
  }
  $.plot.plugins.push({
    init: init,
    options: options,
    name: 'time',
    version: '1.0'
  });

  // Time-axis support used to be in Flot core, which exposed the
  // formatDate function on the plot object.  Various plugins depend
  // on the function, so we need to re-expose it here.

  $.plot.formatDate = formatDate;
  $.plot.dateGenerator = dateGenerator;
})(jQuery);
},{}],117:[function(require,module,exports){
"use strict";

/*
 * jquery.flot.tooltip
 * 
 * description: easy-to-use tooltips for Flot charts
 * version: 0.6.2
 * author: Krzysztof Urbas @krzysu [myviews.pl]
 * website: https://github.com/krzysu/flot.tooltip
 * 
 * build on 2013-09-30
 * released under MIT License, 2012
*/
(function (t) {
  var o = {
      tooltip: !1,
      tooltipOpts: {
        content: "%s | X: %x | Y: %y",
        xDateFormat: null,
        yDateFormat: null,
        shifts: {
          x: 10,
          y: 20
        },
        defaultTheme: !0,
        onHover: function onHover() {}
      }
    },
    i = function i(t) {
      this.tipPosition = {
        x: 0,
        y: 0
      }, this.init(t);
    };
  i.prototype.init = function (o) {
    function i(t) {
      var o = {};
      o.x = t.pageX, o.y = t.pageY, s.updateTooltipPosition(o);
    }
    function e(t, o, i) {
      var e = s.getDomElement();
      if (i) {
        var n;
        n = s.stringFormat(s.tooltipOptions.content, i), e.html(n), s.updateTooltipPosition({
          x: o.pageX,
          y: o.pageY
        }), e.css({
          left: s.tipPosition.x + s.tooltipOptions.shifts.x,
          top: s.tipPosition.y + s.tooltipOptions.shifts.y
        }).show(), "function" == typeof s.tooltipOptions.onHover && s.tooltipOptions.onHover(i, e);
      } else e.hide().html("");
    }
    var s = this;
    o.hooks.bindEvents.push(function (o, n) {
      s.plotOptions = o.getOptions(), s.plotOptions.tooltip !== !1 && void 0 !== s.plotOptions.tooltip && (s.tooltipOptions = s.plotOptions.tooltipOpts, s.getDomElement(), t(o.getPlaceholder()).bind("plothover", e), t(n).bind("mousemove", i));
    }), o.hooks.shutdown.push(function (o, s) {
      t(o.getPlaceholder()).unbind("plothover", e), t(s).unbind("mousemove", i);
    });
  }, i.prototype.getDomElement = function () {
    var o;
    return t("#flotTip").length > 0 ? o = t("#flotTip") : (o = t("<div />").attr("id", "flotTip"), o.appendTo("body").hide().css({
      position: "absolute"
    }), this.tooltipOptions.defaultTheme && o.css({
      background: "#fff",
      "z-index": "100",
      padding: "0.4em 0.6em",
      "border-radius": "0.5em",
      "font-size": "0.8em",
      border: "1px solid #111",
      display: "none",
      "white-space": "nowrap"
    })), o;
  }, i.prototype.updateTooltipPosition = function (o) {
    var i = t("#flotTip").outerWidth() + this.tooltipOptions.shifts.x,
      e = t("#flotTip").outerHeight() + this.tooltipOptions.shifts.y;
    o.x - t(window).scrollLeft() > t(window).innerWidth() - i && (o.x -= i), o.y - t(window).scrollTop() > t(window).innerHeight() - e && (o.y -= e), this.tipPosition.x = o.x, this.tipPosition.y = o.y;
  }, i.prototype.stringFormat = function (t, o) {
    var i = /%p\.{0,1}(\d{0,})/,
      e = /%s/,
      s = /%x\.{0,1}(?:\d{0,})/,
      n = /%y\.{0,1}(?:\d{0,})/;
    return "function" == typeof t && (t = t(o.series.label, o.series.data[o.dataIndex][0], o.series.data[o.dataIndex][1], o)), o.series.percent !== void 0 && (t = this.adjustValPrecision(i, t, o.series.percent)), o.series.label !== void 0 && (t = t.replace(e, o.series.label)), this.isTimeMode("xaxis", o) && this.isXDateFormat(o) && (t = t.replace(s, this.timestampToDate(o.series.data[o.dataIndex][0], this.tooltipOptions.xDateFormat))), this.isTimeMode("yaxis", o) && this.isYDateFormat(o) && (t = t.replace(n, this.timestampToDate(o.series.data[o.dataIndex][1], this.tooltipOptions.yDateFormat))), "number" == typeof o.series.data[o.dataIndex][0] && (t = this.adjustValPrecision(s, t, o.series.data[o.dataIndex][0])), "number" == typeof o.series.data[o.dataIndex][1] && (t = this.adjustValPrecision(n, t, o.series.data[o.dataIndex][1])), o.series.xaxis.tickFormatter !== void 0 && (t = t.replace(s, o.series.xaxis.tickFormatter(o.series.data[o.dataIndex][0], o.series.xaxis))), o.series.yaxis.tickFormatter !== void 0 && (t = t.replace(n, o.series.yaxis.tickFormatter(o.series.data[o.dataIndex][1], o.series.yaxis))), t;
  }, i.prototype.isTimeMode = function (t, o) {
    return o.series[t].options.mode !== void 0 && "time" === o.series[t].options.mode;
  }, i.prototype.isXDateFormat = function () {
    return this.tooltipOptions.xDateFormat !== void 0 && null !== this.tooltipOptions.xDateFormat;
  }, i.prototype.isYDateFormat = function () {
    return this.tooltipOptions.yDateFormat !== void 0 && null !== this.tooltipOptions.yDateFormat;
  }, i.prototype.timestampToDate = function (o, i) {
    var e = new Date(o);
    return t.plot.formatDate(e, i);
  }, i.prototype.adjustValPrecision = function (t, o, i) {
    var e,
      s = o.match(t);
    return null !== s && "" !== RegExp.$1 && (e = RegExp.$1, i = i.toFixed(e), o = o.replace(t, i)), o;
  };
  var e = function e(t) {
    new i(t);
  };
  t.plot.plugins.push({
    init: e,
    options: o,
    name: "tooltip",
    version: "0.6.1"
  });
})(jQuery);
},{}]},{},[109]);
