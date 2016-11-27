/**
 * PVLng - PhotoVoltaic Logger new generation (https://pvlng.com/)
 *
 * @link       https://github.com/KKoPV/PVLng
 * @author     Knut Kohl <github@knutkohl.de>
 * @copyright  2012-2016 Knut Kohl
 * @license    MIT License (MIT) http://opensource.org/licenses/MIT
 */

/**
 * Settings
 */
var APIUrl = '//' + config.host + '/api/latest/',
    languages = [ 'en', 'de' ], // Available languages
    colors = [
        '#7cb5ec', '#434348', '#90ed7d', '#f7a35c', '#8085e9',
        '#f15c80', '#e4d354', '#2b908f', '#f45b5b', '#91e8e1'
    ];

/**
 * Defaults and helper
 */
var color_act = colors[0],
    color_est = colors[2],
    chartOptions = {
        chart: {
            spacingLeft:   0,
            spacingTop:    5,
            spacingRight:  0,
            spacingBottom: 0
        },
        credits: { enabled: false },
        legend: { enabled: false },
        xAxis: { type: 'datetime' }
    },
    today, i18n;

/**
 * Detect prefered language from browser language
 */
function getUserLanguage(languages) {
    var userLang = (window.navigator.languages || [window.navigator.language || window.navigator.userLanguage])
                   // Get only the first 2 characters in lowercase
                   .map( function(lang) { return lang.substring(0, 2).toLowerCase() } )
                   // Get only unique languages
                   .filter( function(value, index, self) { return self.indexOf(value) === index } )
    // Search prefered language in available languages
    for (var i=0; i<userLang.length; i++) {
        if (languages.indexOf(userLang[i]) != -1) return userLang[i];
    }
    // Fallback to first available language
    return languages[0];
}

/**
 * Load data, fill badges and draw charts
 */
function loadData() {

    var container = $('.badges');

    today = new Date();

    if (!container.children().length) {
        // 1st call, create badges by cloning template
        var tpl = $($('#badge-template').html());
        $(config.badges).each(function(id, badge) {
            var el = tpl.clone();
            $('.channel-icon', el).addClass('fa-' + badge.icon);
            el.prop('id', 'badge-'+id).appendTo(container);
        });
        container.show();
    }

    // Get data
    $(config.badges).each(function(id, badge) {
        $.getJSON(
            APIUrl + 'data/last/' + badge.guid + '?attributes=true&callback=?',
            function(data) {
                var attr = data.shift(), name = attr.name, el = '#badge-'+id;
                if (attr.description) name += ' (' + attr.description + ')';
                $('.channel-name', el).html(name);
                $('.channel-unit', el).html(attr.unit);
                if (data.length) {
                    // Todays data exists
                    var d = new Date(data[0].timestamp*1000);
                    $('.last-value', el).html(
                        data[0].data.toFixed(badge.decimals != null ? badge.decimals : attr.decimals)
                    );
                    $('.panel-footer .pull-left', el).html(d.toLocaleDateString());
                    $('.panel-footer .pull-right', el).html(d.toLocaleTimeString());
                } else {
                    $('.last-value, .panel-footer .pull-left, .panel-footer .pull-right', el)
                    .html('?');
                }
            }
        );
    });

    if (config.power) {
        $('.chart-wrapper.power').show();

        // Day chart
        $.getJSON(
            APIUrl + 'data/' + config.power + '?callback=?',
            {
                attributes: true,
                period: '5i',
                short: true
            },
            function(data) {
                var attr = data.shift(), _data = [];
                for (i=0; i<data.length; i++) {
                    _data.push([ data[i][0]*1000, data[i][1] ]);
                }
                var name = $('<div/>').html(attr.name).text();
                var options = $.extend(chartOptions, {
                    title: { text: name },
                    tooltip: {
                        shared: true,
                        valueSuffix: ' ' + attr.unit,
                        xDateFormat: '%H:%M'
                    },
                    yAxis: { title: { text: attr.unit } },
                    series: [{
                        color: color_act,
                        name: name,
                        marker: { enabled: false },
                        type: 'areaspline',
                        data: _data
                    }]
                });
                drawChart('day-chart', options);
            }
        );
    }

    if (config.energy) {
        // Generate charts
        $('.chart-wrapper.energy').show();

        // Week and month chart
        $.getJSON(
            APIUrl + 'data/' + config.energy + '?callback=?',
            {
                attributes: true,
                period: '1d',
                start: -30, // Last 30 days
                short: true
            },
            function(data) {
                var attr = data.shift(), data30 = [], offset = 0;
                for (i=0; i<data.length; i++) {
                    data30.push([ data[i][0]*1000, +(data[i][1]-offset).toFixed(attr.decimals) ]);
                    offset = data[i][1];
                }
                var name = $('<div/>').html(attr.name).text();
                var options = $.extend(chartOptions, {
                    tooltip: {
                        valueSuffix: ' ' + attr.unit,
                        xDateFormat: '%Y-%m-%d'
                    },
                    yAxis: {
                        plotBands: [{
                            color: color_est,
                            from: 0,
                            to: config.estimate[today.getMonth()]/30
                        }],
                        title: { text: attr.unit }
                    }
                })
                // Week chart
                options.series = [{
                    color: color_act,
                    name: name,
                    type: 'column',
                    data: data30.slice(-7) // Last 7 days
                }];
                drawChart('week-chart', options);
                // Month chart
                options.series[0].data = data30;
                drawChart('month-chart', options);
            }
        );

        // Year chart
        var start = new Date(new Date().getFullYear(), 0, 1); // 1st of Jan

        $.getJSON(
            APIUrl + 'data/' + config.energy + '?callback=?',
            {
                attributes: true,
                period: '1m',
                start: start.getTime()/1000,
                short: true
            },
            function(data) {
                var attr = data.shift(), _data = [], offset = 0, _est = [];
                for (i=0; i<data.length; i++) {
                    _data.push([ data[i][0]*1000, Math.round(data[i][1]-offset, 0) ]);
                    _est.push([ data[i][0]*1000, config.estimate[i] ]);
                    offset = data[i][1];
                }

                i--;

                // Fill estimated data until end of year
                for (j=1; i+j<12; j++) {
                    _est.push([ (data[i][0]+j*30*86400)*1000, config.estimate[i+j] ]);
                }

                // HTML decode name
                var name = $('<div/>').html(attr.name).text(), series = [];

                // Estimates defined?
                if (config.estimate.reduce(function(a, b) { return a+b }, 0)) {
                    series.push({
                        color: color_est,
                        name: i18n._('estimate'),
                        marker: { enabled: false },
                        type: 'areaspline',
                        data: _est
                    });
                }

                series.push({
                    color: color_act,
                    name: name,
                    type: 'column',
                    data: _data 
                });

                drawChart('year-chart', $.extend(chartOptions, {
                    tooltip: {
                        shared: true,
                        valueSuffix: ' ' + attr.unit,
                        xDateFormat: '%Y-%m'
                    },
                    yAxis: { title: { text: attr.unit } },
                    series: series,
                }));

            }
        );
    }
}

/**
 * Create chart with aspect ratio
 */
function drawChart(container, options) {
    options.chart.height = $('#'+container).width() * 9 / 16;
    Highcharts.chart(container, options);
}

/**
 * Resize chart according to chart container
 */
function resizeChart(container) {
    w = container.width();
    container.highcharts().setSize(w, w * 9 / 16, true);
}

/**
 * Translate texts
 */
function translate(languages) {
    var l = languages;
    this._ = function(text) {
        return l[text] ? l[text] : '{{' + text + '}}';
    }
}

/**
 *
 */
$(function() {

    $(window).on('resize', function() {
        $('.highcharts-container').each(function(id, chart) {
            resizeChart($(chart).parent())
        });
    });

    $.when(
        $.getJSON(APIUrl + 'settings/title?callback=?'),
        $.getJSON(APIUrl + 'translate/' + getUserLanguage(languages) + '/dashboard?callback=?')
    ).done(function(title, texts) {

        $('span', '.page-header').html(title[0]);
        document.title = $('.page-header').text();

        i18n = new translate(texts[0]);
        $('.i18n').each(function(id, el) {
            el = $(el);
            el.html(i18n._(el.data('i18n')));
        });

        loadData();
    });

});