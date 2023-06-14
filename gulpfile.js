const gulp = require('gulp');
const shell = require('gulp-shell');
const ts = require('gulp-typescript');

const tsProject = ts.createProject('tsconfig.json');

function clean(cb) {
    import('del')
        .then((del) => del.deleteSync(['dist']))
        .then(() => cb());
}

function install(cb) {
    if (process.env.NPM_INSTALL) {
        shell.task('npm install'); 
    }
    cb();
}

function compile(cb) {
    tsProject
        .src()
        .pipe(tsProject()).js
        .pipe(gulp.dest('dist'));
    cb();
}

function copyPackageJson(cb) {
    gulp
        .src('package.json')
        .pipe(gulp.dest('dist'));
    cb();
}

exports.clean = clean;
exports.install = install;
exports.compile = compile;
exports.build = gulp.series(clean, install, compile, copyPackageJson);
exports.default = exports.build;