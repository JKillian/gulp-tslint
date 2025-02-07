/*jshint node:true */
/*jshint nomen: true */
"use strict";

// Requires
import * as TSLint from "tslint";
// import * as vinyl from "vinyl";
import * as through from "through";
const gutil = require("gulp-util");
const PluginError = gutil.PluginError;
const map = require("map-stream");

// Load rc configs
import Rcloader = require("rcloader");

export interface PluginOptions {
    configuration?: any;
    rulesDirectory?: string;
    tslint?: any;
}

export interface ReportOptions {
    emitError?: boolean;
    reportLimit?: number;
    summarizeFailureOutput?: boolean;
}

export interface TslintFile /* extends vinyl.File */ {
    tslint: any;
    path: string;
    relative: string;
    contents: Buffer | any;

    // The following are copied from vinyl.File. vinyl.File is not used
    // since the typings .d.ts shouldn't include ambient external declarations..
    isStream(): boolean;
    isNull(): boolean;
}

export interface Position {
    // Lines and characters start from 0
    position: number;
    line: number;
    character: number;
}

export interface Failure {
    name: string;
    failure: string;
    startPosition: Position;
    endPosition: Position;
    ruleName: string;
}

export interface Reporter {
    (failures: Failure[], file?: TslintFile, options?: ReportOptions): void;
}

export interface TslintPlugin {
    (pluginOptions?: PluginOptions): any;
    proseErrorFormat: (failure: Failure) => string;
    report: (reporter: string | Reporter, options?: ReportOptions) => any;
}

/**
 * Helper function to check if a value is a function
 * @param {any} value to check whether or not it is a function.
 * @returns {boolean} Returns true if the value is a function.
 */
function isFunction(value: any) {
    return Object.prototype.toString.call(value) === "[object Function]";
}

/**
 * Returns the TSLint from the options, or if not set, the default TSLint.
 * @param {PluginOptions} options
 * @returns {any} TSLint module
 */
function getTslint(options: PluginOptions) {
    if (options && options.tslint) {
        return options.tslint;
    }

    return TSLint;
}

/**
 * Log an event or error using gutil.log.
 * @param {string} message the log message.
 * @param {string} level can be "error". Optional.
 * Leave empty for the default logging type.
 */
function log(message: string, level?: string) {
    const prefix = "[" + gutil.colors.cyan("gulp-tslint") + "]";

    if (level === "error") {
        gutil.log(prefix, gutil.colors.red("error"), message);
    } else {
        gutil.log(prefix, message);
    }
}

/*
 * Convert a failure to the prose error format.
 * @param {Failure} failure
 * @returns {string} The failure in the prose error formar.
 */
const proseErrorFormat = function(failure: Failure) {
    // line + 1 because TSLint's first line and character is 0
    return failure.name + "[" + (failure.startPosition.line + 1) + ", " +
        (failure.startPosition.character + 1) + "]: " + failure.failure;
};

/**
 * Main plugin function
 * @param {PluginOptions} [pluginOptions] contains the options for gulp-tslint.
 * Optional.
 * @returns {any}
 */
const tslintPlugin = <TslintPlugin> function(pluginOptions?: PluginOptions) {
    let loader: any;
    let tslint: any;

    // If user options are undefined, set an empty options object
    if (!pluginOptions) {
        pluginOptions = {};
    }

    // Create rcloader to load tslint.json
    loader = new Rcloader("tslint.json", pluginOptions.configuration);

    return map(function(file: TslintFile,
            cb: (error: any, file?: TslintFile) => void) {

        // Skip
        if (file.isNull()) {
            return cb(null, file);
        }

        // Stream is not supported
        if (file.isStream()) {
            return cb(new PluginError("gulp-tslint", "Streaming not supported"));
        }

        // Finds the config file closest to the linted file
        loader.for(file.path, function(error: any, fileOptions: any) {
            // TSLint default options
            const options = {
                configuration: fileOptions,
                formatter: "json",
                // not used, use reporters instead
                formattersDirectory: <string> null,
                rulesDirectory: pluginOptions.rulesDirectory || null
            };

            if (error) {
                return cb(error, undefined);
            }

            const linter = getTslint(pluginOptions);
            tslint = new linter(file.relative, file.contents.toString("utf8"), options);
            file.tslint = tslint.lint();

            // Pass file
            cb(null, file);
        });
    });
};

/**
 * Define default reporters
 */

 /**
  * JSON error reporter.
  * @param {Array<Failure>} failures
  */
const jsonReporter = function(failures: Failure[]) {
    log(JSON.stringify(failures), "error");
};

 /**
  * Prose error reporter.
  * @param {Array<Failure>} failures
  */
const proseReporter = function(failures: Failure[]) {
    failures.forEach(function(failure) {
        log(proseErrorFormat(failure), "error");
    });
};

 /**
  * Verbose error reporter.
  * @param {Array<Failure>} failures
  */
const verboseReporter = function(failures: Failure[]) {
    failures.forEach(function(failure) {
        // line + 1 because TSLint's first line and character is 0
        log("(" + failure.ruleName + ") " + failure.name +
            "[" + (failure.startPosition.line + 1) + ", " +
            (failure.startPosition.character + 1) + "]: " +
            failure.failure, "error");
    });
};

 /**
  * Full error reporter. Like verbose, but prints full path.
  * @param {Array<Failure>} failures
  * @param {TslintFile} file
  */
const fullReporter = function(failures: Failure[], file: TslintFile) {
    failures.forEach(function(failure) {
        // line + 1 because TSLint's first line and character is 0
        log("(" + failure.ruleName + ") " + file.path +
            "[" + (failure.startPosition.line + 1) + ", " +
            (failure.startPosition.character + 1) + "]: " +
            failure.failure, "error");
    });
};

 /**
  * MsBuild Format error reporter.
  * @param {Array<Failure>} failures
  * @param {TslintFile} file
  */
const msbuildReporter = function(failures: Failure[], file: TslintFile) {
    failures.forEach(function(failure) {
        const positionTuple = "(" + (failure.startPosition.line + 1) + "," +
            (failure.startPosition.character + 1) + ")";
        console.log(file.path + positionTuple + ": warning " +
            failure.ruleName + ": " + failure.failure);
    });
};

// Export proseErrorFormat function
tslintPlugin.proseErrorFormat = proseErrorFormat;

/* Output is in the following form:
 * [{
 *   "name": "invalid.ts",
 *   "failure": "missing whitespace",
 *   // Lines and characters start from 0
 *   "startPosition": {"position": 8, "line": 0, "character": 8},
 *   "endPosition": {"position": 9, "line": 0, "character": 9},
 *   "ruleName": "one-line"
 * }]
 */
tslintPlugin.report = function(reporter: string | Reporter,
        options?: ReportOptions) {

    // Default options
    if (!options) {
        options = {};
    }
    if (options.emitError === undefined) {
        options.emitError = true;
    }
    if (options.reportLimit === undefined) {
        // 0 or less is unlimited
        options.reportLimit = 0;
    }
    if (options.summarizeFailureOutput === undefined) {
        options.summarizeFailureOutput = false;
    }

    // Collect all files with errors
    const errorFiles: TslintFile[] = [];

    // Collect all failures
    const allFailures: Failure[] = [];

    // Track how many errors have been reported
    let totalReported = 0;

    // Run the reporter for each file individually
    const reportFailures = function(file: TslintFile) {
        const failures = JSON.parse(file.tslint.output);
        if (failures.length > 0) {
            errorFiles.push(file);
            Array.prototype.push.apply(allFailures, failures);

            if (options.reportLimit <= 0 || (options.reportLimit && options.reportLimit > totalReported)) {
                totalReported += failures.length;
                if (reporter === "json") {
                    jsonReporter(failures);
                } else if (reporter === "prose") {
                    proseReporter(failures);
                } else if (reporter === "verbose") {
                    verboseReporter(failures);
                } else if (reporter === "full") {
                    fullReporter(failures, file);
                } else if (reporter === "msbuild") {
                    msbuildReporter(failures, file);
                } else if (isFunction(reporter)) {
                    (<Reporter> reporter)(failures, file, options);
                }

                if (options.reportLimit > 0 &&
                        options.reportLimit <= totalReported) {

                    log("More than " + options.reportLimit
                        + " failures reported. Turning off reporter.");
                }
            }
        }

        // Pass file
        this.emit("data", file);
    };

    /**
     * After reporting on all files, throw the error.
     */
    const throwErrors = function() {
        // Throw error
        if (options && errorFiles.length > 0) {
            let failuresToOutput = allFailures;
            let ignoreFailureCount = 0;

            // If error count is limited, calculate number of errors not shown and slice reportLimit
            // number of errors to be included in the error.
            if (options.reportLimit > 0) {
                ignoreFailureCount = allFailures.length - options.reportLimit;
                failuresToOutput = allFailures.slice(0, options.reportLimit);
            }

            // Always use the proseErrorFormat for the error.
            const failureOutput = failuresToOutput.map(function(failure) {
                return proseErrorFormat(failure);
            }).join(", ");

            let errorOutput = "Failed to lint: ";
            if (options.summarizeFailureOutput) {
                errorOutput += failuresToOutput.length + " errors.";
            } else {
                errorOutput += failureOutput + ".";
            }
            if (ignoreFailureCount > 0) {
                errorOutput += " (" + ignoreFailureCount
                    + " other errors not shown.)";
            }

            if (options.emitError === true) {
                return this.emit("error", new PluginError("gulp-tslint",
                    errorOutput));
            } else if (options.summarizeFailureOutput) {
                log(errorOutput);
            }
        }

        // Notify through that we're done
        this.emit("end");
    };

    return through(reportFailures, throwErrors);
};

export default tslintPlugin;

// ES5/ES6 fallbacks
module.exports = tslintPlugin;
module.exports.default = tslintPlugin;
