const gulp = require('gulp');
const shell = require('gulp-shell');
const ts = require('gulp-typescript');

const tsProject = ts.createProject('tsconfig.json');

function install(cb) {
    if (process.env.NPM_INSTALL) {
        shell.task('npm install'); 
    }
    cb();
}

function compile(cb) {
    tsProject.src()
        .pipe(tsProject()).js
        .pipe(gulp.dest('dist'));
    cb();
}

exports.default = gulp.series(install, compile);