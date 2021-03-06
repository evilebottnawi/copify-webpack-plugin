import Promise from 'bluebird';
import _ from 'lodash';
import preProcessPattern from './preProcessPattern';
import processPattern from './processPattern';
import path from 'path';

function CopyWebpackPlugin(patterns = [], options = {}) {
    if (!Array.isArray(patterns)) {
        throw new Error('[copy-webpack-plugin] patterns must be an array');
    }

    // Defaults debug level to 'warning'
    options.debug = options.debug || 'warning';

    // Defaults debugging to info if only true is specified
    if (options.debug === true) {
        options.debug = 'info';
    }

    options.manifest = options.manifest ? Object.assign({}, {
        basePath: '',
        path: '.',
        processFromPattern: null,
        filename: 'webpack-assets.json',
        processOutput(assets) {
            return JSON.stringify(assets, null, null);
        }
    }, options.manifest) : null;

    const assetsMap = {};
    const debugLevels = ['warning', 'info', 'debug'];
    const debugLevelIndex = debugLevels.indexOf(options.debug);
    function log(msg, level) {
        if (level === 0) {
            msg = `WARNING - ${msg}`; 
        } else {
            level = level || 1;
        }
        if (level <= debugLevelIndex) {
            console.log('[copy-webpack-plugin] ' + msg); // eslint-disable-line no-console
        }
    }

    function warning(msg) {
        log(msg, 0);
    }

    function info(msg) {
        log(msg, 1);
    }

    function debug(msg) {
        log(msg, 2);
    }

    const apply = (compiler) => {
        const fileDependencies = [];
        const contextDependencies = [];
        const written = {};

        compiler.plugin('emit', (compilation, cb) => {
            debug('starting emit');
            const callback = () => {
                debug('finishing emit');
                cb();
            };

            const globalRef = {
                info,
                debug,
                warning,
                compilation,
                written,
                fileDependencies,
                contextDependencies,
                context: compiler.options.context,
                output: compiler.options.output.path,
                ignore: options.ignore || [],
                copyUnmodified: options.copyUnmodified,
                concurrency: options.concurrency
            };

            if (globalRef.output === '/' &&
                compiler.options.devServer &&
                compiler.options.devServer.outputPath) {
                globalRef.output = compiler.options.devServer.outputPath;
            }

            Promise.each(patterns, (pattern) => {
                if (options.manifest) {
                    pattern.manifestBasePath = pattern.manifestBasePath
                        ? pattern.manifestBasePath
                        : options.manifest.basePath;

                    pattern.excludeFromManifest = pattern.excludeFromManifest
                        ? pattern.excludeFromManifest
                        : false;
                }

                // Identify absolute source of each pattern and destination type
                return preProcessPattern(globalRef, pattern)
                .then((pattern) => {
                    // Every source (from) is assumed to exist here
                    return processPattern(globalRef, pattern, options.manifest ? assetsMap : null);
                });
            })
            .then(() => {
                if (options.manifest && Object.keys(assetsMap).length > 0) {
                    const outputPath = path.join(options.manifest.path, options.manifest.filename);
                    const content = options.manifest.processOutput(assetsMap);

                    compilation.assets[outputPath] = {
                        size: function() {
                            return content.length;
                        },
                        source: function() {
                            return content;
                        }
                    };
                }
            })
            .catch((err) => {
                compilation.errors.push(err);
            })
            .finally(callback);
        });

        compiler.plugin('after-emit', (compilation, cb) => {
            debug('starting after-emit');
            const callback = () => {
                debug('finishing after-emit');
                cb();
            };

            // Add file dependencies if they're not already tracked
            _.forEach(fileDependencies, (file) => {
                if (_.includes(compilation.fileDependencies, file)) {
                    debug(`not adding ${file} to change tracking, because it's already tracked`);
                } else {
                    debug(`adding ${file} to change tracking`);
                    compilation.fileDependencies.push(file);
                }
            });

            // Add context dependencies if they're not already tracked
            _.forEach(contextDependencies, (context) => {
                if (_.includes(compilation.contextDependencies, context)) {
                    debug(`not adding ${context} to change tracking, because it's already tracked`);
                } else {
                    debug(`adding ${context} to change tracking`);
                    compilation.contextDependencies.push(context);
                }
            });

            callback();
        });
    };
    
    return {
        apply
    };
}

CopyWebpackPlugin['default'] = CopyWebpackPlugin;
module.exports = CopyWebpackPlugin;
