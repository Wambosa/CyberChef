"use strict";

const glob = require("glob");
const path = require("path");

const nodeFlags = "--experimental-modules --experimental-json-modules --experimental-specifier-resolution=node --no-warnings --no-deprecation";

/**
 * Grunt configuration for building the app in various formats.
 *
 * @author n1474335 [n1474335@gmail.com]
 * @copyright Crown Copyright 2017
 * @license Apache-2.0
 */

module.exports = function (grunt) {
    grunt.file.defaultEncoding = "utf8";
    grunt.file.preserveBOM = false;

    // Tasks

    grunt.registerTask("node",
        "Compiles CyberChef into a single NodeJS module.",
        [
            "clean:node", "clean:config", "clean:nodeConfig", "exec:generateConfig", "exec:generateNodeIndex"
        ]);

    grunt.registerTask("configTests",
        "A task which configures config files in preparation for tests to be run. Use `npm test` to run tests.",
        [
            "clean:config", "clean:nodeConfig", "exec:generateConfig", "exec:generateNodeIndex"
        ]);

    grunt.registerTask("testnodeconsumer",
        "A task which checks whether consuming CJS and ESM apps work with the CyberChef build",
        ["exec:setupNodeConsumers", "exec:testCJSNodeConsumer", "exec:testESMNodeConsumer", "exec:teardownNodeConsumers"]);

    grunt.registerTask("default",
        "Lints the code base",
        ["eslint", "exec:repoSize"]);

    grunt.registerTask("lint", "eslint");

    // Load tasks provided by each plugin
    grunt.loadNpmTasks("grunt-eslint");
    grunt.loadNpmTasks("grunt-contrib-clean");
    grunt.loadNpmTasks("grunt-contrib-copy");
    grunt.loadNpmTasks("grunt-contrib-watch");
    grunt.loadNpmTasks("grunt-chmod");
    grunt.loadNpmTasks("grunt-exec");
    grunt.loadNpmTasks("grunt-contrib-connect");
    grunt.loadNpmTasks("grunt-zip");


    // Project configuration
    const compileTime = grunt.template.today("UTC:dd/mm/yyyy HH:MM:ss") + " UTC"
    const pkg = grunt.file.readJSON("package.json")
    const BUILD_CONSTANTS = {
        COMPILE_TIME: JSON.stringify(compileTime),
        COMPILE_MSG: JSON.stringify(grunt.option("compile-msg") || grunt.option("msg") || ""),
        PKG_VERSION: JSON.stringify(pkg.version),
    }
    const moduleEntryPoints = listEntryModules()
    const nodeConsumerTestPath = "~/tmp-cyberchef"


    /**
     * Generates an entry list for all the modules.
     */
    function listEntryModules() {
        const entryModules = {};

        glob.sync("./src/core/config/modules/*.mjs").forEach(file => {
            const basename = path.basename(file);
            if (basename !== "Default.mjs" && basename !== "OpModules.mjs")
                entryModules["modules/" + basename.split(".mjs")[0]] = path.resolve(file);
        });

        return entryModules;
    }

    /**
     * Detects the correct delimiter to use to chain shell commands together
     * based on the current OS.
     *
     * @param {string[]} cmds
     * @returns {string}
     */
    function chainCommands(cmds) {
        const win = process.platform === "win32";
        if (!win) {
            return cmds.join(";");
        }
        return cmds
            // && means that subsequent commands will not be executed if the
            // previous one fails. & would coninue on a fail
            .join("&&")
            // Windows does not support \n properly
            .replace(/\n/g, "\\n");
    }

    grunt.initConfig({
        clean: {
            dev: ["build/dev/*"],
            prod: ["build/prod/*"],
            node: ["build/node/*"],
            config: ["src/core/config/OperationConfig.json", "src/core/config/modules/*", "src/code/operations/index.mjs"],
            nodeConfig: ["src/node/index.mjs", "src/node/config/OperationConfig.json"],
            standalone: ["build/prod/CyberChef*.html"]
        },
        eslint: {
            configs: ["*.{js,mjs}"],
            core: ["src/core/**/*.{js,mjs}", "!src/core/vendor/**/*", "!src/core/operations/legacy/**/*"],
            web: ["src/web/**/*.{js,mjs}", "!src/web/static/**/*"],
            node: ["src/node/**/*.{js,mjs}"],
            tests: ["tests/**/*.{js,mjs}"],
        },
        zip: {
            standalone: {
                cwd: "build/prod/",
                src: [
                    "build/prod/**/*",
                    "!build/prod/index.html",
                    "!build/prod/BundleAnalyzerReport.html",
                ],
                dest: `build/prod/CyberChef_v${pkg.version}.zip`
            }
        },
        connect: {
            prod: {
                options: {
                    port: grunt.option("port") || 8000,
                    base: "build/prod/"
                }
            }
        },
        copy: {
            ghPages: {
                options: {
                    process: function (content, srcpath) {
                        if (srcpath.indexOf("index.html") >= 0) {
                            // Add Google Analytics code to index.html
                            content = content.replace("</body></html>",
                                grunt.file.read("src/web/static/ga.html") + "</body></html>");

                            // Add Structured Data for SEO
                            content = content.replace("</head>",
                                "<script type='application/ld+json'>" +
                                JSON.stringify(JSON.parse(grunt.file.read("src/web/static/structuredData.json"))) +
                                "</script></head>");
                            return grunt.template.process(content, srcpath);
                        } else {
                            return content;
                        }
                    },
                    noProcess: ["**", "!**/*.html"]
                },
                files: [
                    {
                        src: ["build/prod/index.html"],
                        dest: "build/prod/index.html"
                    }
                ]
            },
            standalone: {
                options: {
                    process: function (content, srcpath) {
                        if (srcpath.indexOf("index.html") >= 0) {
                            // Replace download link with version number
                            content = content.replace(/<a [^>]+>Download CyberChef.+?<\/a>/,
                                `<span>Version ${pkg.version}</span>`);

                            return grunt.template.process(content, srcpath);
                        } else {
                            return content;
                        }
                    },
                    noProcess: ["**", "!**/*.html"]
                },
                files: [
                    {
                        src: ["build/prod/index.html"],
                        dest: `build/prod/CyberChef_v${pkg.version}.html`
                    }
                ]
            }
        },
        chmod: {
            build: {
                options: {
                    mode: "755",
                },
                src: ["build/**/*", "build/"]
            }
        },
        watch: {
            config: {
                files: ["src/core/operations/**/*", "!src/core/operations/index.mjs"],
                tasks: ["exec:generateNodeIndex", "exec:generateConfig"]
            }
        },
        exec: {
            repoSize: {
                command: chainCommands([
                    "git ls-files | wc -l | xargs printf '\n%b\ttracked files\n'",
                    "du -hs | egrep -o '^[^\t]*' | xargs printf '%b\trepository size\n'"
                ]),
                stderr: false
            },
            cleanGit: {
                command: "git gc --prune=now --aggressive"
            },
            sitemap: {
                command: `node ${nodeFlags} src/web/static/sitemap.mjs > build/prod/sitemap.xml`,
                sync: true
            },
            generateConfig: {
                command: chainCommands([
                    "echo '\n--- Regenerating config files. ---'",
                    "echo [] > src/core/config/OperationConfig.json",
                    `node ${nodeFlags} src/core/config/scripts/generateOpsIndex.mjs`,
                    `node ${nodeFlags} src/core/config/scripts/generateConfig.mjs`,
                    "echo '--- Config scripts finished. ---\n'"
                ]),
                sync: true
            },
            generateNodeIndex: {
                command: chainCommands([
                    "echo '\n--- Regenerating node index ---'",
                    `node ${nodeFlags} src/node/config/scripts/generateNodeIndex.mjs`,
                    "echo '--- Node index generated. ---\n'"
                ]),
                sync: true
            },
            browserTests: {
                command: "./node_modules/.bin/nightwatch --env prod"
            },
            setupNodeConsumers: {
                command: chainCommands([
                    "echo '\n--- Testing node consumers ---'",
                    "npm link",
                    `mkdir ${nodeConsumerTestPath}`,
                    `cp tests/node/consumers/* ${nodeConsumerTestPath}`,
                    `cd ${nodeConsumerTestPath}`,
                    "npm link cyberchef"
                ]),
                sync: true
            },
            teardownNodeConsumers: {
                command: chainCommands([
                    `rm -rf ${nodeConsumerTestPath}`,
                    "echo '\n--- Node consumer tests complete ---'"
                ]),
            },
            testCJSNodeConsumer: {
                command: chainCommands([
                    `cd ${nodeConsumerTestPath}`,
                    `node ${nodeFlags} cjs-consumer.js`,
                ]),
                stdout: false,
            },
            testESMNodeConsumer: {
                command: chainCommands([
                    `cd ${nodeConsumerTestPath}`,
                    `node ${nodeFlags} esm-consumer.mjs`,
                ]),
                stdout: false,
            },
            fixCryptoApiImports: {
                command: `echo "badass command, but hey lets just fork instead"`,
                stdout: false
            }
        },
    });
};
