/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 19800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 19800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 112.0, "minX": 0.0, "maxY": 434.0, "series": [{"data": [[0.0, 112.0], [0.1, 112.0], [0.2, 112.0], [0.3, 112.0], [0.4, 112.0], [0.5, 112.0], [0.6, 112.0], [0.7, 112.0], [0.8, 112.0], [0.9, 112.0], [1.0, 112.0], [1.1, 112.0], [1.2, 112.0], [1.3, 112.0], [1.4, 112.0], [1.5, 112.0], [1.6, 112.0], [1.7, 112.0], [1.8, 112.0], [1.9, 112.0], [2.0, 112.0], [2.1, 112.0], [2.2, 112.0], [2.3, 112.0], [2.4, 112.0], [2.5, 112.0], [2.6, 112.0], [2.7, 112.0], [2.8, 112.0], [2.9, 112.0], [3.0, 112.0], [3.1, 112.0], [3.2, 112.0], [3.3, 112.0], [3.4, 112.0], [3.5, 112.0], [3.6, 112.0], [3.7, 112.0], [3.8, 112.0], [3.9, 112.0], [4.0, 112.0], [4.1, 112.0], [4.2, 112.0], [4.3, 112.0], [4.4, 112.0], [4.5, 112.0], [4.6, 112.0], [4.7, 112.0], [4.8, 112.0], [4.9, 112.0], [5.0, 113.0], [5.1, 113.0], [5.2, 113.0], [5.3, 113.0], [5.4, 113.0], [5.5, 113.0], [5.6, 113.0], [5.7, 113.0], [5.8, 113.0], [5.9, 113.0], [6.0, 113.0], [6.1, 113.0], [6.2, 113.0], [6.3, 113.0], [6.4, 113.0], [6.5, 113.0], [6.6, 113.0], [6.7, 113.0], [6.8, 113.0], [6.9, 113.0], [7.0, 113.0], [7.1, 113.0], [7.2, 113.0], [7.3, 113.0], [7.4, 113.0], [7.5, 113.0], [7.6, 113.0], [7.7, 113.0], [7.8, 113.0], [7.9, 113.0], [8.0, 113.0], [8.1, 113.0], [8.2, 113.0], [8.3, 113.0], [8.4, 113.0], [8.5, 113.0], [8.6, 113.0], [8.7, 113.0], [8.8, 113.0], [8.9, 113.0], [9.0, 113.0], [9.1, 113.0], [9.2, 113.0], [9.3, 113.0], [9.4, 113.0], [9.5, 113.0], [9.6, 113.0], [9.7, 113.0], [9.8, 113.0], [9.9, 113.0], [10.0, 116.0], [10.1, 116.0], [10.2, 116.0], [10.3, 116.0], [10.4, 116.0], [10.5, 116.0], [10.6, 116.0], [10.7, 116.0], [10.8, 116.0], [10.9, 116.0], [11.0, 116.0], [11.1, 116.0], [11.2, 116.0], [11.3, 116.0], [11.4, 116.0], [11.5, 116.0], [11.6, 116.0], [11.7, 116.0], [11.8, 116.0], [11.9, 116.0], [12.0, 116.0], [12.1, 116.0], [12.2, 116.0], [12.3, 116.0], [12.4, 116.0], [12.5, 116.0], [12.6, 116.0], [12.7, 116.0], [12.8, 116.0], [12.9, 116.0], [13.0, 116.0], [13.1, 116.0], [13.2, 116.0], [13.3, 116.0], [13.4, 116.0], [13.5, 116.0], [13.6, 116.0], [13.7, 116.0], [13.8, 116.0], [13.9, 116.0], [14.0, 116.0], [14.1, 116.0], [14.2, 116.0], [14.3, 116.0], [14.4, 116.0], [14.5, 116.0], [14.6, 116.0], [14.7, 116.0], [14.8, 116.0], [14.9, 116.0], [15.0, 116.0], [15.1, 116.0], [15.2, 116.0], [15.3, 116.0], [15.4, 116.0], [15.5, 116.0], [15.6, 116.0], [15.7, 116.0], [15.8, 116.0], [15.9, 116.0], [16.0, 116.0], [16.1, 116.0], [16.2, 116.0], [16.3, 116.0], [16.4, 116.0], [16.5, 116.0], [16.6, 116.0], [16.7, 116.0], [16.8, 116.0], [16.9, 116.0], [17.0, 116.0], [17.1, 116.0], [17.2, 116.0], [17.3, 116.0], [17.4, 116.0], [17.5, 116.0], [17.6, 116.0], [17.7, 116.0], [17.8, 116.0], [17.9, 116.0], [18.0, 116.0], [18.1, 116.0], [18.2, 116.0], [18.3, 116.0], [18.4, 116.0], [18.5, 116.0], [18.6, 116.0], [18.7, 116.0], [18.8, 116.0], [18.9, 116.0], [19.0, 116.0], [19.1, 116.0], [19.2, 116.0], [19.3, 116.0], [19.4, 116.0], [19.5, 116.0], [19.6, 116.0], [19.7, 116.0], [19.8, 116.0], [19.9, 116.0], [20.0, 133.0], [20.1, 133.0], [20.2, 133.0], [20.3, 133.0], [20.4, 133.0], [20.5, 133.0], [20.6, 133.0], [20.7, 133.0], [20.8, 133.0], [20.9, 133.0], [21.0, 133.0], [21.1, 133.0], [21.2, 133.0], [21.3, 133.0], [21.4, 133.0], [21.5, 133.0], [21.6, 133.0], [21.7, 133.0], [21.8, 133.0], [21.9, 133.0], [22.0, 133.0], [22.1, 133.0], [22.2, 133.0], [22.3, 133.0], [22.4, 133.0], [22.5, 133.0], [22.6, 133.0], [22.7, 133.0], [22.8, 133.0], [22.9, 133.0], [23.0, 133.0], [23.1, 133.0], [23.2, 133.0], [23.3, 133.0], [23.4, 133.0], [23.5, 133.0], [23.6, 133.0], [23.7, 133.0], [23.8, 133.0], [23.9, 133.0], [24.0, 133.0], [24.1, 133.0], [24.2, 133.0], [24.3, 133.0], [24.4, 133.0], [24.5, 133.0], [24.6, 133.0], [24.7, 133.0], [24.8, 133.0], [24.9, 133.0], [25.0, 135.0], [25.1, 135.0], [25.2, 135.0], [25.3, 135.0], [25.4, 135.0], [25.5, 135.0], [25.6, 135.0], [25.7, 135.0], [25.8, 135.0], [25.9, 135.0], [26.0, 135.0], [26.1, 135.0], [26.2, 135.0], [26.3, 135.0], [26.4, 135.0], [26.5, 135.0], [26.6, 135.0], [26.7, 135.0], [26.8, 135.0], [26.9, 135.0], [27.0, 135.0], [27.1, 135.0], [27.2, 135.0], [27.3, 135.0], [27.4, 135.0], [27.5, 135.0], [27.6, 135.0], [27.7, 135.0], [27.8, 135.0], [27.9, 135.0], [28.0, 135.0], [28.1, 135.0], [28.2, 135.0], [28.3, 135.0], [28.4, 135.0], [28.5, 135.0], [28.6, 135.0], [28.7, 135.0], [28.8, 135.0], [28.9, 135.0], [29.0, 135.0], [29.1, 135.0], [29.2, 135.0], [29.3, 135.0], [29.4, 135.0], [29.5, 135.0], [29.6, 135.0], [29.7, 135.0], [29.8, 135.0], [29.9, 135.0], [30.0, 137.0], [30.1, 137.0], [30.2, 137.0], [30.3, 137.0], [30.4, 137.0], [30.5, 137.0], [30.6, 137.0], [30.7, 137.0], [30.8, 137.0], [30.9, 137.0], [31.0, 137.0], [31.1, 137.0], [31.2, 137.0], [31.3, 137.0], [31.4, 137.0], [31.5, 137.0], [31.6, 137.0], [31.7, 137.0], [31.8, 137.0], [31.9, 137.0], [32.0, 137.0], [32.1, 137.0], [32.2, 137.0], [32.3, 137.0], [32.4, 137.0], [32.5, 137.0], [32.6, 137.0], [32.7, 137.0], [32.8, 137.0], [32.9, 137.0], [33.0, 137.0], [33.1, 137.0], [33.2, 137.0], [33.3, 137.0], [33.4, 137.0], [33.5, 137.0], [33.6, 137.0], [33.7, 137.0], [33.8, 137.0], [33.9, 137.0], [34.0, 137.0], [34.1, 137.0], [34.2, 137.0], [34.3, 137.0], [34.4, 137.0], [34.5, 137.0], [34.6, 137.0], [34.7, 137.0], [34.8, 137.0], [34.9, 137.0], [35.0, 139.0], [35.1, 139.0], [35.2, 139.0], [35.3, 139.0], [35.4, 139.0], [35.5, 139.0], [35.6, 139.0], [35.7, 139.0], [35.8, 139.0], [35.9, 139.0], [36.0, 139.0], [36.1, 139.0], [36.2, 139.0], [36.3, 139.0], [36.4, 139.0], [36.5, 139.0], [36.6, 139.0], [36.7, 139.0], [36.8, 139.0], [36.9, 139.0], [37.0, 139.0], [37.1, 139.0], [37.2, 139.0], [37.3, 139.0], [37.4, 139.0], [37.5, 139.0], [37.6, 139.0], [37.7, 139.0], [37.8, 139.0], [37.9, 139.0], [38.0, 139.0], [38.1, 139.0], [38.2, 139.0], [38.3, 139.0], [38.4, 139.0], [38.5, 139.0], [38.6, 139.0], [38.7, 139.0], [38.8, 139.0], [38.9, 139.0], [39.0, 139.0], [39.1, 139.0], [39.2, 139.0], [39.3, 139.0], [39.4, 139.0], [39.5, 139.0], [39.6, 139.0], [39.7, 139.0], [39.8, 139.0], [39.9, 139.0], [40.0, 141.0], [40.1, 141.0], [40.2, 141.0], [40.3, 141.0], [40.4, 141.0], [40.5, 141.0], [40.6, 141.0], [40.7, 141.0], [40.8, 141.0], [40.9, 141.0], [41.0, 141.0], [41.1, 141.0], [41.2, 141.0], [41.3, 141.0], [41.4, 141.0], [41.5, 141.0], [41.6, 141.0], [41.7, 141.0], [41.8, 141.0], [41.9, 141.0], [42.0, 141.0], [42.1, 141.0], [42.2, 141.0], [42.3, 141.0], [42.4, 141.0], [42.5, 141.0], [42.6, 141.0], [42.7, 141.0], [42.8, 141.0], [42.9, 141.0], [43.0, 141.0], [43.1, 141.0], [43.2, 141.0], [43.3, 141.0], [43.4, 141.0], [43.5, 141.0], [43.6, 141.0], [43.7, 141.0], [43.8, 141.0], [43.9, 141.0], [44.0, 141.0], [44.1, 141.0], [44.2, 141.0], [44.3, 141.0], [44.4, 141.0], [44.5, 141.0], [44.6, 141.0], [44.7, 141.0], [44.8, 141.0], [44.9, 141.0], [45.0, 261.0], [45.1, 261.0], [45.2, 261.0], [45.3, 261.0], [45.4, 261.0], [45.5, 261.0], [45.6, 261.0], [45.7, 261.0], [45.8, 261.0], [45.9, 261.0], [46.0, 261.0], [46.1, 261.0], [46.2, 261.0], [46.3, 261.0], [46.4, 261.0], [46.5, 261.0], [46.6, 261.0], [46.7, 261.0], [46.8, 261.0], [46.9, 261.0], [47.0, 261.0], [47.1, 261.0], [47.2, 261.0], [47.3, 261.0], [47.4, 261.0], [47.5, 261.0], [47.6, 261.0], [47.7, 261.0], [47.8, 261.0], [47.9, 261.0], [48.0, 261.0], [48.1, 261.0], [48.2, 261.0], [48.3, 261.0], [48.4, 261.0], [48.5, 261.0], [48.6, 261.0], [48.7, 261.0], [48.8, 261.0], [48.9, 261.0], [49.0, 261.0], [49.1, 261.0], [49.2, 261.0], [49.3, 261.0], [49.4, 261.0], [49.5, 261.0], [49.6, 261.0], [49.7, 261.0], [49.8, 261.0], [49.9, 261.0], [50.0, 289.0], [50.1, 289.0], [50.2, 289.0], [50.3, 289.0], [50.4, 289.0], [50.5, 289.0], [50.6, 289.0], [50.7, 289.0], [50.8, 289.0], [50.9, 289.0], [51.0, 289.0], [51.1, 289.0], [51.2, 289.0], [51.3, 289.0], [51.4, 289.0], [51.5, 289.0], [51.6, 289.0], [51.7, 289.0], [51.8, 289.0], [51.9, 289.0], [52.0, 289.0], [52.1, 289.0], [52.2, 289.0], [52.3, 289.0], [52.4, 289.0], [52.5, 289.0], [52.6, 289.0], [52.7, 289.0], [52.8, 289.0], [52.9, 289.0], [53.0, 289.0], [53.1, 289.0], [53.2, 289.0], [53.3, 289.0], [53.4, 289.0], [53.5, 289.0], [53.6, 289.0], [53.7, 289.0], [53.8, 289.0], [53.9, 289.0], [54.0, 289.0], [54.1, 289.0], [54.2, 289.0], [54.3, 289.0], [54.4, 289.0], [54.5, 289.0], [54.6, 289.0], [54.7, 289.0], [54.8, 289.0], [54.9, 289.0], [55.0, 289.0], [55.1, 289.0], [55.2, 289.0], [55.3, 289.0], [55.4, 289.0], [55.5, 289.0], [55.6, 289.0], [55.7, 289.0], [55.8, 289.0], [55.9, 289.0], [56.0, 289.0], [56.1, 289.0], [56.2, 289.0], [56.3, 289.0], [56.4, 289.0], [56.5, 289.0], [56.6, 289.0], [56.7, 289.0], [56.8, 289.0], [56.9, 289.0], [57.0, 289.0], [57.1, 289.0], [57.2, 289.0], [57.3, 289.0], [57.4, 289.0], [57.5, 289.0], [57.6, 289.0], [57.7, 289.0], [57.8, 289.0], [57.9, 289.0], [58.0, 289.0], [58.1, 289.0], [58.2, 289.0], [58.3, 289.0], [58.4, 289.0], [58.5, 289.0], [58.6, 289.0], [58.7, 289.0], [58.8, 289.0], [58.9, 289.0], [59.0, 289.0], [59.1, 289.0], [59.2, 289.0], [59.3, 289.0], [59.4, 289.0], [59.5, 289.0], [59.6, 289.0], [59.7, 289.0], [59.8, 289.0], [59.9, 289.0], [60.0, 289.0], [60.1, 289.0], [60.2, 289.0], [60.3, 289.0], [60.4, 289.0], [60.5, 289.0], [60.6, 289.0], [60.7, 289.0], [60.8, 289.0], [60.9, 289.0], [61.0, 289.0], [61.1, 289.0], [61.2, 289.0], [61.3, 289.0], [61.4, 289.0], [61.5, 289.0], [61.6, 289.0], [61.7, 289.0], [61.8, 289.0], [61.9, 289.0], [62.0, 289.0], [62.1, 289.0], [62.2, 289.0], [62.3, 289.0], [62.4, 289.0], [62.5, 289.0], [62.6, 289.0], [62.7, 289.0], [62.8, 289.0], [62.9, 289.0], [63.0, 289.0], [63.1, 289.0], [63.2, 289.0], [63.3, 289.0], [63.4, 289.0], [63.5, 289.0], [63.6, 289.0], [63.7, 289.0], [63.8, 289.0], [63.9, 289.0], [64.0, 289.0], [64.1, 289.0], [64.2, 289.0], [64.3, 289.0], [64.4, 289.0], [64.5, 289.0], [64.6, 289.0], [64.7, 289.0], [64.8, 289.0], [64.9, 289.0], [65.0, 298.0], [65.1, 298.0], [65.2, 298.0], [65.3, 298.0], [65.4, 298.0], [65.5, 298.0], [65.6, 298.0], [65.7, 298.0], [65.8, 298.0], [65.9, 298.0], [66.0, 298.0], [66.1, 298.0], [66.2, 298.0], [66.3, 298.0], [66.4, 298.0], [66.5, 298.0], [66.6, 298.0], [66.7, 298.0], [66.8, 298.0], [66.9, 298.0], [67.0, 298.0], [67.1, 298.0], [67.2, 298.0], [67.3, 298.0], [67.4, 298.0], [67.5, 298.0], [67.6, 298.0], [67.7, 298.0], [67.8, 298.0], [67.9, 298.0], [68.0, 298.0], [68.1, 298.0], [68.2, 298.0], [68.3, 298.0], [68.4, 298.0], [68.5, 298.0], [68.6, 298.0], [68.7, 298.0], [68.8, 298.0], [68.9, 298.0], [69.0, 298.0], [69.1, 298.0], [69.2, 298.0], [69.3, 298.0], [69.4, 298.0], [69.5, 298.0], [69.6, 298.0], [69.7, 298.0], [69.8, 298.0], [69.9, 298.0], [70.0, 408.0], [70.1, 408.0], [70.2, 408.0], [70.3, 408.0], [70.4, 408.0], [70.5, 408.0], [70.6, 408.0], [70.7, 408.0], [70.8, 408.0], [70.9, 408.0], [71.0, 408.0], [71.1, 408.0], [71.2, 408.0], [71.3, 408.0], [71.4, 408.0], [71.5, 408.0], [71.6, 408.0], [71.7, 408.0], [71.8, 408.0], [71.9, 408.0], [72.0, 408.0], [72.1, 408.0], [72.2, 408.0], [72.3, 408.0], [72.4, 408.0], [72.5, 408.0], [72.6, 408.0], [72.7, 408.0], [72.8, 408.0], [72.9, 408.0], [73.0, 408.0], [73.1, 408.0], [73.2, 408.0], [73.3, 408.0], [73.4, 408.0], [73.5, 408.0], [73.6, 408.0], [73.7, 408.0], [73.8, 408.0], [73.9, 408.0], [74.0, 408.0], [74.1, 408.0], [74.2, 408.0], [74.3, 408.0], [74.4, 408.0], [74.5, 408.0], [74.6, 408.0], [74.7, 408.0], [74.8, 408.0], [74.9, 408.0], [75.0, 415.0], [75.1, 415.0], [75.2, 415.0], [75.3, 415.0], [75.4, 415.0], [75.5, 415.0], [75.6, 415.0], [75.7, 415.0], [75.8, 415.0], [75.9, 415.0], [76.0, 415.0], [76.1, 415.0], [76.2, 415.0], [76.3, 415.0], [76.4, 415.0], [76.5, 415.0], [76.6, 415.0], [76.7, 415.0], [76.8, 415.0], [76.9, 415.0], [77.0, 415.0], [77.1, 415.0], [77.2, 415.0], [77.3, 415.0], [77.4, 415.0], [77.5, 415.0], [77.6, 415.0], [77.7, 415.0], [77.8, 415.0], [77.9, 415.0], [78.0, 415.0], [78.1, 415.0], [78.2, 415.0], [78.3, 415.0], [78.4, 415.0], [78.5, 415.0], [78.6, 415.0], [78.7, 415.0], [78.8, 415.0], [78.9, 415.0], [79.0, 415.0], [79.1, 415.0], [79.2, 415.0], [79.3, 415.0], [79.4, 415.0], [79.5, 415.0], [79.6, 415.0], [79.7, 415.0], [79.8, 415.0], [79.9, 415.0], [80.0, 424.0], [80.1, 424.0], [80.2, 424.0], [80.3, 424.0], [80.4, 424.0], [80.5, 424.0], [80.6, 424.0], [80.7, 424.0], [80.8, 424.0], [80.9, 424.0], [81.0, 424.0], [81.1, 424.0], [81.2, 424.0], [81.3, 424.0], [81.4, 424.0], [81.5, 424.0], [81.6, 424.0], [81.7, 424.0], [81.8, 424.0], [81.9, 424.0], [82.0, 424.0], [82.1, 424.0], [82.2, 424.0], [82.3, 424.0], [82.4, 424.0], [82.5, 424.0], [82.6, 424.0], [82.7, 424.0], [82.8, 424.0], [82.9, 424.0], [83.0, 424.0], [83.1, 424.0], [83.2, 424.0], [83.3, 424.0], [83.4, 424.0], [83.5, 424.0], [83.6, 424.0], [83.7, 424.0], [83.8, 424.0], [83.9, 424.0], [84.0, 424.0], [84.1, 424.0], [84.2, 424.0], [84.3, 424.0], [84.4, 424.0], [84.5, 424.0], [84.6, 424.0], [84.7, 424.0], [84.8, 424.0], [84.9, 424.0], [85.0, 425.0], [85.1, 425.0], [85.2, 425.0], [85.3, 425.0], [85.4, 425.0], [85.5, 425.0], [85.6, 425.0], [85.7, 425.0], [85.8, 425.0], [85.9, 425.0], [86.0, 425.0], [86.1, 425.0], [86.2, 425.0], [86.3, 425.0], [86.4, 425.0], [86.5, 425.0], [86.6, 425.0], [86.7, 425.0], [86.8, 425.0], [86.9, 425.0], [87.0, 425.0], [87.1, 425.0], [87.2, 425.0], [87.3, 425.0], [87.4, 425.0], [87.5, 425.0], [87.6, 425.0], [87.7, 425.0], [87.8, 425.0], [87.9, 425.0], [88.0, 425.0], [88.1, 425.0], [88.2, 425.0], [88.3, 425.0], [88.4, 425.0], [88.5, 425.0], [88.6, 425.0], [88.7, 425.0], [88.8, 425.0], [88.9, 425.0], [89.0, 425.0], [89.1, 425.0], [89.2, 425.0], [89.3, 425.0], [89.4, 425.0], [89.5, 425.0], [89.6, 425.0], [89.7, 425.0], [89.8, 425.0], [89.9, 425.0], [90.0, 426.0], [90.1, 426.0], [90.2, 426.0], [90.3, 426.0], [90.4, 426.0], [90.5, 426.0], [90.6, 426.0], [90.7, 426.0], [90.8, 426.0], [90.9, 426.0], [91.0, 426.0], [91.1, 426.0], [91.2, 426.0], [91.3, 426.0], [91.4, 426.0], [91.5, 426.0], [91.6, 426.0], [91.7, 426.0], [91.8, 426.0], [91.9, 426.0], [92.0, 426.0], [92.1, 426.0], [92.2, 426.0], [92.3, 426.0], [92.4, 426.0], [92.5, 426.0], [92.6, 426.0], [92.7, 426.0], [92.8, 426.0], [92.9, 426.0], [93.0, 426.0], [93.1, 426.0], [93.2, 426.0], [93.3, 426.0], [93.4, 426.0], [93.5, 426.0], [93.6, 426.0], [93.7, 426.0], [93.8, 426.0], [93.9, 426.0], [94.0, 426.0], [94.1, 426.0], [94.2, 426.0], [94.3, 426.0], [94.4, 426.0], [94.5, 426.0], [94.6, 426.0], [94.7, 426.0], [94.8, 426.0], [94.9, 426.0], [95.0, 434.0], [95.1, 434.0], [95.2, 434.0], [95.3, 434.0], [95.4, 434.0], [95.5, 434.0], [95.6, 434.0], [95.7, 434.0], [95.8, 434.0], [95.9, 434.0], [96.0, 434.0], [96.1, 434.0], [96.2, 434.0], [96.3, 434.0], [96.4, 434.0], [96.5, 434.0], [96.6, 434.0], [96.7, 434.0], [96.8, 434.0], [96.9, 434.0], [97.0, 434.0], [97.1, 434.0], [97.2, 434.0], [97.3, 434.0], [97.4, 434.0], [97.5, 434.0], [97.6, 434.0], [97.7, 434.0], [97.8, 434.0], [97.9, 434.0], [98.0, 434.0], [98.1, 434.0], [98.2, 434.0], [98.3, 434.0], [98.4, 434.0], [98.5, 434.0], [98.6, 434.0], [98.7, 434.0], [98.8, 434.0], [98.9, 434.0], [99.0, 434.0], [99.1, 434.0], [99.2, 434.0], [99.3, 434.0], [99.4, 434.0], [99.5, 434.0], [99.6, 434.0], [99.7, 434.0], [99.8, 434.0], [99.9, 434.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 5.0, "minX": 100.0, "maxY": 9.0, "series": [{"data": [[200.0, 5.0], [100.0, 9.0], [400.0, 6.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 400.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 20.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 20.0, "series": [{"data": [[0.0, 20.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 4.9E-324, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 6.800000000000001, "minX": 1.55410974E12, "maxY": 6.800000000000001, "series": [{"data": [[1.55410974E12, 6.800000000000001]], "isOverall": false, "label": "Thread Group", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55410974E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 133.0, "minX": 1.0, "maxY": 369.2, "series": [{"data": [[8.0, 262.0], [4.0, 140.0], [2.0, 135.0], [1.0, 261.0], [10.0, 231.66666666666669], [5.0, 133.0], [6.0, 369.2], [7.0, 265.5]], "isOverall": false, "label": "HTTP Request", "isController": false}, {"data": [[6.800000000000001, 255.0]], "isOverall": false, "label": "HTTP Request-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 10.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 39.333333333333336, "minX": 1.55410974E12, "maxY": 4987.95, "series": [{"data": [[1.55410974E12, 4987.95]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.55410974E12, 39.333333333333336]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55410974E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 255.0, "minX": 1.55410974E12, "maxY": 255.0, "series": [{"data": [[1.55410974E12, 255.0]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55410974E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 193.35000000000002, "minX": 1.55410974E12, "maxY": 193.35000000000002, "series": [{"data": [[1.55410974E12, 193.35000000000002]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55410974E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 59.8, "minX": 1.55410974E12, "maxY": 59.8, "series": [{"data": [[1.55410974E12, 59.8]], "isOverall": false, "label": "HTTP Request", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55410974E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 112.0, "minX": 1.55410974E12, "maxY": 434.0, "series": [{"data": [[1.55410974E12, 434.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.55410974E12, 112.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.55410974E12, 425.9]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.55410974E12, 434.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.55410974E12, 433.6]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55410974E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 275.0, "minX": 0.0, "maxY": 275.0, "series": [{"data": [[0.0, 275.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 237.0, "minX": 0.0, "maxY": 237.0, "series": [{"data": [[0.0, 237.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 4.9E-324, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 0.3333333333333333, "minX": 1.55410974E12, "maxY": 0.3333333333333333, "series": [{"data": [[1.55410974E12, 0.3333333333333333]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55410974E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.3333333333333333, "minX": 1.55410974E12, "maxY": 0.3333333333333333, "series": [{"data": [[1.55410974E12, 0.3333333333333333]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.55410974E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.3333333333333333, "minX": 1.55410974E12, "maxY": 0.3333333333333333, "series": [{"data": [[1.55410974E12, 0.3333333333333333]], "isOverall": false, "label": "HTTP Request-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.55410974E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 19800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
